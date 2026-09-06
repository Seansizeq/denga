import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDb } from './db.js';
import { runMigrations } from './migrations.js';
import {
  customCategoriesUserScopedKey,
  legacyTransactionCurrencyFromNote,
  userDataVersionCounters,
} from './migrations-list.js';

let workDir;
let db;
let previousDatabasePath;
const silent = { logger: { log: () => {} } };

beforeEach(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'denga-migrations-'));
  previousDatabasePath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path.join(workDir, 'test.sqlite');
  db = await initDb();
});

afterEach(async () => {
  await db?.close();
  if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previousDatabasePath;
  fs.rmSync(workDir, { recursive: true, force: true });
});

const now = () => new Date().toISOString();

const addCategory = (userId, id, name) =>
  db.run(
    `INSERT INTO custom_categories (id, user_id, type, name, normalized_name, icon, color, createdAt, updatedAt)
     VALUES (?, ?, 'expense', ?, ?, 'Coffee', '#7C5CFF', ?, ?)`,
    [id, userId, name, name.toLowerCase(), now(), now()],
  );

describe('001 — власні категорії з ключем у межах користувача', () => {
  // initDb уже прогнав міграції, тож перевіряємо підсумковий стан схеми.
  it('дає двом людям завести категорію з однаковою назвою', async () => {
    const sameId = 'custom:%D0%9A%D0%B0%D0%B2%D0%B0|Coffee|%237C5CFF';

    await addCategory('111', sameId, 'Кава');
    // Саме цей рядок раніше падав з UNIQUE constraint failed і давав 500.
    await addCategory('222', sameId, 'Кава');

    const rows = await db.all('SELECT user_id FROM custom_categories ORDER BY user_id');
    expect(rows.map((r) => r.user_id)).toEqual(['111', '222']);
  });

  it('і далі не дає одній людині завести дубль', async () => {
    await addCategory('111', 'custom:X|Tag|%23FFFFFF', 'Кава');
    await expect(addCategory('111', 'custom:X|Tag|%23FFFFFF', 'Кава')).rejects.toThrow(/UNIQUE/);
  });

  it('унікальність назви теж рахується в межах людини', async () => {
    await addCategory('111', 'custom:A|Tag|%23FFFFFF', 'Кава');
    // Інший id, та сама нормалізована назва — для того самого користувача це дубль.
    await expect(addCategory('111', 'custom:B|Tag|%23FFFFFF', 'Кава')).rejects.toThrow(/UNIQUE/);
    // А для іншого — ні.
    await expect(addCategory('222', 'custom:B|Tag|%23FFFFFF', 'Кава')).resolves.toBeTruthy();
  });

  it('переносить наявні рядки, а не створює порожню таблицю', async () => {
    // Відтворюємо стару таблицю з глобальним ключем і даними в ній.
    await db.exec('DROP TABLE custom_categories');
    await db.exec(`CREATE TABLE custom_categories (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT '', type TEXT NOT NULL,
      name TEXT NOT NULL, normalized_name TEXT NOT NULL, icon TEXT NOT NULL,
      color TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`);
    await addCategory('111', 'custom:Стара|Tag|%23FFFFFF', 'Стара');
    await db.run('DELETE FROM app_cache');

    await runMigrations(db, [customCategoriesUserScopedKey], silent);

    const rows = await db.all('SELECT id, user_id, name FROM custom_categories');
    expect(rows).toEqual([{ id: 'custom:Стара|Tag|%23FFFFFF', user_id: '111', name: 'Стара' }]);
  });
});

describe('002 — валюта з примітки', () => {
  const addTx = (id, currency, note) =>
    db.run(
      `INSERT INTO transactions (id, user_id, amount, currency, categoryId, type, date, note)
       VALUES (?, '111', 100, ?, 'food', 'expense', ?, ?)`,
      [id, currency, now(), note],
    );

  const runStep = async () => {
    await db.run('DELETE FROM app_cache');
    await runMigrations(db, [legacyTransactionCurrencyFromNote], silent);
  };

  it('переносить валюту з маркера в колонку', async () => {
    await addTx('a', 'UAH', 'Обід Currency: PLN');
    await runStep();
    expect((await db.get("SELECT currency FROM transactions WHERE id = 'a'")).currency).toBe('PLN');
  });

  it('не чіпає примітку, де валюта згадана просто текстом', async () => {
    // Груба заміна за підрядком «UAH» зіпсувала б саме такий рядок.
    await addTx('b', 'PLN', 'переказ у UAH з картки');
    await runStep();
    expect((await db.get("SELECT currency FROM transactions WHERE id = 'b'")).currency).toBe('PLN');
  });

  it('невідомий код згортає до гривні — як робив старий розбір', async () => {
    await addTx('c', 'PLN', 'Currency: EUR');
    await runStep();
    expect((await db.get("SELECT currency FROM transactions WHERE id = 'c'")).currency).toBe('UAH');
  });

  it('не переписує деномінацію крипти', async () => {
    // `normalizeCurrency` згортала BTC до UAH, тож старий код переписав би
    // цей рядок на USD і знищив суму в монеті.
    await addTx('d', 'BTC', 'купівля Currency: USD');
    await runStep();
    expect((await db.get("SELECT currency FROM transactions WHERE id = 'd'")).currency).toBe('BTC');
  });

  it('виконується один раз', async () => {
    await addTx('e', 'UAH', 'Currency: PLN');
    await runStep();
    // Друга спроба нічого не робить, бо крок уже відмічений.
    const second = await runMigrations(db, [legacyTransactionCurrencyFromNote], silent);
    expect(second.applied).toEqual([]);
  });
});

describe('003 — лічильники версії даних', () => {
  const userId = '111';

  const version = () =>
    db.get('SELECT transactions_v AS tx, accounts_v AS acc FROM user_data_version WHERE user_id = ?', [userId]);

  const addTx = (id) =>
    db.run(
      `INSERT INTO transactions (id, user_id, amount, currency, categoryId, type, date)
       VALUES (?, ?, 10, 'UAH', 'food', 'expense', ?)`,
      [id, userId, now()],
    );

  it('росте на кожен запис транзакції — і на вставку, і на правку, і на видалення', async () => {
    await addTx('t1');
    const afterInsert = await version();
    expect(afterInsert.tx).toBe(1);

    await db.run("UPDATE transactions SET amount = 20 WHERE id = 't1'");
    expect((await version()).tx).toBe(2);

    await db.run("DELETE FROM transactions WHERE id = 't1'");
    expect((await version()).tx).toBe(3);
  });

  it('рахує рахунки окремо від транзакцій', async () => {
    await addTx('t1');
    await db.run(
      `INSERT INTO account_portfolio (account_key, user_id, section, sort_index, name,
        primary_amount, primary_currency, icon_tone, updatedAt)
       VALUES ('acc', ?, 'cash', 0, 'Готівка', 0, 'UAH', 'neutral', ?)`,
      [userId, now()],
    );

    const v = await version();
    expect(v.tx).toBe(1);
    expect(v.acc).toBe(1);
  });

  it('не змішує версії різних людей', async () => {
    await addTx('t1');
    await db.run(
      `INSERT INTO transactions (id, user_id, amount, currency, categoryId, type, date)
       VALUES ('t2', '222', 10, 'UAH', 'food', 'expense', ?)`,
      [now()],
    );

    expect((await version()).tx).toBe(1);
    const other = await db.get("SELECT transactions_v AS tx FROM user_data_version WHERE user_id = '222'");
    expect(other.tx).toBe(1);
  });

  it('стартує з наявних даних, а не з нуля', async () => {
    // Інакше клієнт із кешем «версія 3» вважав би свіжу версію 1 застарілою
    // і не оновився б.
    await db.exec('DROP TRIGGER trg_txv_insert');
    await addTx('old1');
    await addTx('old2');
    await db.run('DELETE FROM user_data_version');
    await db.run('DELETE FROM app_cache');

    await runMigrations(db, [userDataVersionCounters], silent);

    expect((await version()).tx).toBe(2);
  });
});
