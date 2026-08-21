import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pruneOldBackups, runDatabaseBackup, verifyBackupFile } from './backup.js';

let workDir;
/** Застосунок передає своє зʼєднання лише заради чекпоінта WAL. */
const dbStub = { exec: async () => {} };

const makeBot = () => {
  const alerts = [];
  const documents = [];
  return {
    alerts,
    documents,
    sendMessage: async (chatId, text) => alerts.push({ chatId, text }),
    sendDocument: async (chatId, file) => documents.push({ chatId, file }),
  };
};

const createHealthyDb = async (file) => {
  const db = await open({ filename: file, driver: sqlite3.Database });
  await db.exec('CREATE TABLE transactions (id TEXT PRIMARY KEY, amount REAL)');
  await db.exec("INSERT INTO transactions (id, amount) VALUES ('a', 10), ('b', 20)");
  await db.close();
};

const backupsIn = () =>
  fs.existsSync(path.join(workDir, 'backups')) ? fs.readdirSync(path.join(workDir, 'backups')) : [];

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'denga-backup-'));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe('runDatabaseBackup', () => {
  it('створює копію, яка справді читається', async () => {
    const dbFile = path.join(workDir, 'database.sqlite');
    await createHealthyDb(dbFile);

    const result = await runDatabaseBackup(dbStub, dbFile);

    expect(result.ok).toBe(true);
    expect(await verifyBackupFile(result.file)).toMatchObject({ ok: true, transactions: 2 });
  });

  it('надсилає копію в Telegram, коли заданий chat_id', async () => {
    const dbFile = path.join(workDir, 'database.sqlite');
    await createHealthyDb(dbFile);
    const bot = makeBot();

    await runDatabaseBackup(dbStub, dbFile, { bot, telegramChatId: 777 });

    expect(bot.documents).toHaveLength(1);
    expect(bot.alerts).toHaveLength(0);
  });

  // Головна регресія: два місяці каталог збирав нульові файли, і кожен із них
  // виглядав як успішний бекап.
  it('не лишає нульовий файл, коли знімок не вдався', async () => {
    const dbFile = path.join(workDir, 'database.sqlite');
    fs.writeFileSync(dbFile, 'це не база даних');

    const result = await runDatabaseBackup(dbStub, dbFile);

    expect(result.ok).toBe(false);
    expect(backupsIn()).toHaveLength(0);
  });

  it('повідомляє в Telegram про провал замість тихого логу', async () => {
    const dbFile = path.join(workDir, 'database.sqlite');
    fs.writeFileSync(dbFile, 'це не база даних');
    const bot = makeBot();

    await runDatabaseBackup(dbStub, dbFile, { bot, telegramChatId: 777 });

    expect(bot.alerts).toHaveLength(1);
    expect(bot.alerts[0].text).toContain('бекап БД не створено');
  });

  it('зберігає неперевірену копію під позначкою suspect, а не викидає її', async () => {
    const dbFile = path.join(workDir, 'database.sqlite');
    // Достатньо великий, щоб пройти поріг розміру, але не база: так виглядає
    // побайтова копія пошкодженого файлу.
    fs.writeFileSync(dbFile, Buffer.alloc(8192, 7));

    const result = await runDatabaseBackup(dbStub, dbFile);

    expect(result.ok).toBe(false);
    expect(backupsIn()).toEqual([expect.stringContaining('-suspect.sqlite')]);
  });

  it('прибирає старі копії навіть після невдалого знімка', async () => {
    const dbFile = path.join(workDir, 'database.sqlite');
    fs.writeFileSync(dbFile, 'це не база даних');
    const backupDir = path.join(workDir, 'backups');
    fs.mkdirSync(backupDir);
    fs.writeFileSync(path.join(backupDir, 'database-2026-01-01T06-00-00.sqlite'), '');

    await runDatabaseBackup(dbStub, dbFile);

    expect(backupsIn()).toHaveLength(0);
  });
});

describe('pruneOldBackups', () => {
  it('тримає 20 придатних копій, 3 підозрілі і жодної порожньої', () => {
    const dir = path.join(workDir, 'backups');
    fs.mkdirSync(dir);
    const write = (name, bytes, minute) => {
      const full = path.join(dir, name);
      fs.writeFileSync(full, Buffer.alloc(bytes, 1));
      const t = new Date(Date.UTC(2026, 0, 1, 0, minute));
      fs.utimesSync(full, t, t);
    };

    for (let i = 0; i < 25; i += 1) write(`database-healthy-${i}.sqlite`, 8192, i);
    for (let i = 0; i < 3; i += 1) write(`database-empty-${i}.sqlite`, 0, 30 + i);
    for (let i = 0; i < 5; i += 1) write(`database-old-${i}-suspect.sqlite`, 8192, 40 + i);

    const removed = pruneOldBackups(dir);
    const left = fs.readdirSync(dir);

    expect(removed).toBe(10);
    expect(left.filter((f) => f.includes('healthy'))).toHaveLength(20);
    expect(left.filter((f) => f.includes('suspect'))).toHaveLength(3);
    expect(left.filter((f) => f.includes('empty'))).toHaveLength(0);
  });
});
