import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installGracefulShutdown, runShutdownSequence } from './shutdown.js';

let workDir;

const silentLog = { log: () => {}, warn: () => {}, error: () => {} };

const statusOf = (result, name) => result.steps.find((s) => s.name === name)?.status;

const makeServer = () => {
  const calls = [];
  return {
    calls,
    close: () => calls.push('close'),
    closeIdleConnections: () => calls.push('closeIdleConnections'),
  };
};

const makeBot = () => {
  const calls = [];
  return { calls, stopPolling: async (opts) => calls.push(opts) };
};

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'denga-shutdown-'));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe('runShutdownSequence', () => {
  it('зупиняє HTTP і опитування, потім закриває базу', async () => {
    const server = makeServer();
    const bot = makeBot();
    const order = [];
    const db = {
      exec: async (sql) => order.push(sql),
      close: async () => order.push('close'),
    };

    const result = await runShutdownSequence({ server, db, bot, log: silentLog });

    expect(result.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(server.calls).toEqual(['close', 'closeIdleConnections']);
    expect(bot.calls).toEqual([{ cancel: true }]);
    expect(order).toEqual(['PRAGMA wal_checkpoint(TRUNCATE)', 'close']);
  });

  it('закриває базу, навіть коли опитування Telegram зависло', async () => {
    const db = { exec: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    const bot = { stopPolling: () => new Promise(() => {}) };

    const result = await runShutdownSequence({ server: makeServer(), db, bot, budgetMs: 200, log: silentLog });

    expect(statusOf(result, 'telegram')).toBe('timeout');
    expect(statusOf(result, 'db-close')).toBe('ok');
    expect(db.close).toHaveBeenCalledOnce();
  });

  it('не зривається, якщо крок кинув помилку', async () => {
    const db = { exec: async () => { throw new Error('wal locked'); }, close: vi.fn(async () => {}) };

    const result = await runShutdownSequence({ server: makeServer(), db, log: silentLog });

    expect(statusOf(result, 'wal-checkpoint')).toBe('failed');
    expect(result.steps.find((s) => s.name === 'wal-checkpoint').reason).toContain('wal locked');
    expect(db.close).toHaveBeenCalledOnce();
  });

  it('пропускає відсутні бот і сервер', async () => {
    const db = { exec: async () => {}, close: async () => {} };

    const result = await runShutdownSequence({ server: null, db, bot: null, log: silentLog });

    expect(statusOf(result, 'http')).toBe('skipped');
    expect(statusOf(result, 'telegram')).toBe('skipped');
    expect(statusOf(result, 'db-close')).toBe('ok');
  });

  it('на справжній базі забирає -wal після закриття', async () => {
    const file = path.join(workDir, 'database.sqlite');
    const db = await open({ filename: file, driver: sqlite3.Database });
    await db.exec('PRAGMA journal_mode = WAL');
    await db.exec('CREATE TABLE transactions (id TEXT PRIMARY KEY, amount REAL)');
    await db.exec("INSERT INTO transactions (id, amount) VALUES ('a', 10)");
    expect(fs.existsSync(`${file}-wal`)).toBe(true);

    const result = await runShutdownSequence({ db, log: silentLog });

    expect(statusOf(result, 'wal-checkpoint')).toBe('ok');
    expect(statusOf(result, 'db-close')).toBe('ok');
    expect(fs.existsSync(`${file}-wal`)).toBe(false);

    // Дані пережили закриття й читаються новим зʼєднанням.
    const reopened = await open({ filename: file, driver: sqlite3.Database });
    expect((await reopened.get('SELECT COUNT(*) AS n FROM transactions')).n).toBe(1);
    await reopened.close();
  });
});

describe('installGracefulShutdown', () => {
  it('на SIGTERM проганяє послідовність і виходить із нулем', async () => {
    const target = new EventEmitter();
    const db = { exec: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    const exit = vi.fn();

    installGracefulShutdown({ db, target, exit, log: silentLog, signals: ['SIGTERM'] });
    target.emit('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(db.exec).toHaveBeenCalledWith('PRAGMA wal_checkpoint(TRUNCATE)');
    expect(db.close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('повторний сигнал виходить негайно, не чекаючи бази', async () => {
    const target = new EventEmitter();
    const db = { exec: () => new Promise(() => {}), close: async () => {} };
    const exit = vi.fn();

    installGracefulShutdown({ db, target, exit, log: silentLog, budgetMs: 5000, signals: ['SIGTERM'] });
    target.emit('SIGTERM');
    target.emit('SIGTERM');

    expect(exit).toHaveBeenCalledWith(1);
    expect(exit).toHaveBeenCalledOnce();
  });

  it('знімає обробники за запитом', () => {
    const target = new EventEmitter();
    const uninstall = installGracefulShutdown({ target, exit: () => {}, log: silentLog, signals: ['SIGTERM'] });

    expect(target.listenerCount('SIGTERM')).toBe(1);
    uninstall();
    expect(target.listenerCount('SIGTERM')).toBe(0);
  });
});
