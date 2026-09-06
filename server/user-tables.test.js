import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDb } from './db.js';
import { withTransaction } from './transaction.js';
import {
  USER_TABLES,
  USER_TABLES_INTENTIONALLY_SKIPPED,
  deleteUserData,
  tablesWithUserColumn,
} from './user-tables.js';

let workDir;
let db;
let previousDatabasePath;

beforeEach(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'denga-user-tables-'));
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

describe('USER_TABLES', () => {
  it('покриває кожну таблицю схеми, що має user_id', async () => {
    const inSchema = await tablesWithUserColumn(db);
    const covered = new Set([...USER_TABLES, ...USER_TABLES_INTENTIONALLY_SKIPPED]);
    const missed = inSchema.filter((name) => !covered.has(name));

    // Якщо цей тест впав — ви додали таблицю з `user_id`. Або допишіть її в
    // USER_TABLES, або поясніть у USER_TABLES_INTENTIONALLY_SKIPPED, чому дані
    // людини мають пережити видалення її акаунта.
    expect(missed).toEqual([]);
  });

  it('не згадує таблиць, яких у схемі немає', async () => {
    const inSchema = new Set(await tablesWithUserColumn(db));
    const stale = USER_TABLES.filter((name) => !inSchema.has(name));
    expect(stale).toEqual([]);
  });

  it('не має дублів', () => {
    expect(new Set(USER_TABLES).size).toBe(USER_TABLES.length);
  });
});

describe('deleteUserData', () => {
  const userId = '424242';

  const seed = async () => {
    const now = new Date().toISOString();
    await db.run('INSERT INTO users (telegram_id, chat_id, timezone) VALUES (?, ?, ?)', [
      Number(userId),
      Number(userId),
      'Europe/Warsaw',
    ]);
    await db.run(
      `INSERT INTO transactions (id, user_id, amount, currency, categoryId, type, date)
       VALUES ('t1', ?, 100, 'UAH', 'food', 'expense', ?)`,
      [userId, now],
    );
    await db.run(
      `INSERT INTO debt_events (id, user_id, debt_account_key, event_type, amount, currency, date, created_at)
       VALUES ('d1', ?, 'acc', 'created', 500, 'UAH', ?, ?)`,
      [userId, now, now],
    );
    await db.run(
      `INSERT INTO category_prefs (user_id, category_id, type, sort_order, updatedAt)
       VALUES (?, 'food', 'expense', 0, ?)`,
      [userId, now],
    );
    await db.run(
      `INSERT INTO expense_templates (id, user_id, name, type, currency, category_id, created_at, updated_at)
       VALUES ('e1', ?, 'Кава', 'expense', 'UAH', 'food', ?, ?)`,
      [userId, now, now],
    );
  };

  it('прибирає й ті таблиці, які раніше пропускали', async () => {
    await seed();
    await withTransaction(db, (tx) => deleteUserData(tx, userId));

    for (const table of ['transactions', 'debt_events', 'category_prefs', 'expense_templates']) {
      const row = await db.get(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, [userId]);
      expect(`${table}=${row.n}`).toBe(`${table}=0`);
    }
    const user = await db.get('SELECT COUNT(*) AS n FROM users WHERE telegram_id = ?', [Number(userId)]);
    expect(user.n).toBe(0);
  });

  it('не чіпає дані іншої людини', async () => {
    await seed();
    const other = '999';
    await db.run(
      `INSERT INTO transactions (id, user_id, amount, currency, categoryId, type, date)
       VALUES ('t2', ?, 50, 'UAH', 'food', 'expense', ?)`,
      [other, new Date().toISOString()],
    );

    await withTransaction(db, (tx) => deleteUserData(tx, userId));

    const left = await db.get('SELECT COUNT(*) AS n FROM transactions WHERE user_id = ?', [other]);
    expect(left.n).toBe(1);
  });
});

describe('порядок видалення', () => {
  it('прибирає лічильник версії останнім — інакше тригери його відтворюють', async () => {
    const userId = '777';
    const now = new Date().toISOString();
    await db.run('INSERT INTO users (telegram_id, chat_id, timezone) VALUES (?, ?, ?)', [777, 777, 'UTC']);
    await db.run(
      `INSERT INTO transactions (id, user_id, amount, currency, categoryId, type, date)
       VALUES ('x', ?, 1, 'UAH', 'food', 'expense', ?)`,
      [userId, now],
    );
    await db.run(
      `INSERT INTO account_portfolio (account_key, user_id, section, sort_index, name,
        primary_amount, primary_currency, icon_tone, updatedAt)
       VALUES ('a', ?, 'cash', 0, 'Готівка', 0, 'UAH', 'neutral', ?)`,
      [userId, now],
    );
    // Тригери вже мали створити рядок версії.
    expect((await db.get('SELECT COUNT(*) AS n FROM user_data_version WHERE user_id = ?', [userId])).n).toBe(1);

    await withTransaction(db, (tx) => deleteUserData(tx, userId));

    const left = await db.get('SELECT COUNT(*) AS n FROM user_data_version WHERE user_id = ?', [userId]);
    expect(left.n).toBe(0);
  });
});
