import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDb } from './db.js';
import { withTransaction } from './transaction.js';
import { moveCategoryReferences, releaseCategoryReferences } from './category-references.js';

let workDir;
let db;
let previousDatabasePath;

beforeEach(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'denga-category-refs-'));
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

const USER = '4242';
const OTHER = '7777';
const OLD = 'custom:%D0%9E%D0%B4%D1%8F%D0%B3|Shirt|%23FF6B6B';
const NEW = 'custom:%D0%9E%D0%B4%D1%8F%D0%B3|Shirt|%2334C759';
const now = () => new Date().toISOString();

/** Посилання на категорію в кожному місці, де воно буває. */
const seed = async (userId, categoryId) => {
  const t = now();
  await db.run(
    `INSERT INTO transactions (id, user_id, amount, currency, categoryId, type, date)
     VALUES (?, ?, 100, 'UAH', ?, 'expense', ?)`,
    [`tx-${userId}`, userId, categoryId, t],
  );
  await db.run(
    `INSERT INTO subscriptions (id, user_id, name, amount, currency, categoryId, cycle, nextChargeDate, active, createdAt, updatedAt)
     VALUES (?, ?, 'Spotify', 5, 'PLN', ?, 'monthly', '2026-11-01', 1, ?, ?)`,
    [`sub-${userId}`, userId, categoryId, t, t],
  );
  await db.run(
    `INSERT INTO expense_templates (id, user_id, name, type, amount, currency, category_id, created_at, updated_at)
     VALUES (?, ?, 'Кава', 'expense', 50, 'UAH', ?, ?, ?)`,
    [`tpl-${userId}`, userId, categoryId, t, t],
  );
  await db.run(
    `INSERT INTO category_budgets (user_id, category_id, monthly_limit, currency, updated_at)
     VALUES (?, ?, 3000, 'UAH', ?)`,
    [userId, categoryId, t],
  );
  await db.run(
    `INSERT INTO budget_alerts (user_id, category_id, year_month, level, created_at) VALUES (?, ?, '2026-10', '80', ?)`,
    [userId, categoryId, t],
  );
  await db.run(
    `INSERT INTO category_prefs (user_id, category_id, type, sort_order, updatedAt) VALUES (?, ?, 'expense', 3, ?)`,
    [userId, categoryId, t],
  );
  await db.run(
    `INSERT INTO bank_merchant_rules (user_id, merchant_key, category_id, updated_at) VALUES (?, 'zara', ?, ?)`,
    [userId, categoryId, t],
  );
  await db.run(
    `INSERT INTO bank_inbox (id, user_id, provider, external_id, category_id, picker_ids, created_at)
     VALUES (?, ?, 'monobank', ?, ?, ?, ?)`,
    [`card-${userId}`, userId, `ext-${userId}`, categoryId, JSON.stringify(['food', categoryId, 'other_expense']), t],
  );
};

const references = async (userId) => ({
  transaction: (await db.get('SELECT categoryId AS id FROM transactions WHERE user_id = ?', [userId]))?.id,
  subscription: (await db.get('SELECT categoryId AS id FROM subscriptions WHERE user_id = ?', [userId]))?.id,
  template: (await db.get('SELECT category_id AS id FROM expense_templates WHERE user_id = ?', [userId]))?.id,
  budget: (await db.get('SELECT category_id AS id FROM category_budgets WHERE user_id = ?', [userId]))?.id,
  alert: (await db.get('SELECT category_id AS id FROM budget_alerts WHERE user_id = ?', [userId]))?.id,
  pref: (await db.get('SELECT category_id AS id FROM category_prefs WHERE user_id = ?', [userId]))?.id,
  rule: (await db.get('SELECT category_id AS id FROM bank_merchant_rules WHERE user_id = ?', [userId]))?.id,
  card: (await db.get('SELECT category_id AS id FROM bank_inbox WHERE user_id = ?', [userId]))?.id,
  picker: JSON.parse((await db.get('SELECT picker_ids AS ids FROM bank_inbox WHERE user_id = ?', [userId]))?.ids ?? '[]'),
});

describe('moveCategoryReferences', () => {
  it('переносить на новий id усе, що посилалося на старий', async () => {
    await seed(USER, OLD);
    await withTransaction(db, (tx) => moveCategoryReferences(tx, USER, OLD, NEW));

    expect(await references(USER)).toEqual({
      transaction: NEW,
      subscription: NEW,
      template: NEW,
      budget: NEW,
      alert: NEW,
      pref: NEW,
      rule: NEW,
      card: NEW,
      picker: ['food', NEW, 'other_expense'],
    });
  });

  it('не чіпає чужих даних із тим самим id', async () => {
    await seed(USER, OLD);
    await seed(OTHER, OLD);
    await withTransaction(db, (tx) => moveCategoryReferences(tx, USER, OLD, NEW));

    const other = await references(OTHER);
    expect(other.budget).toBe(OLD);
    expect(other.transaction).toBe(OLD);
  });

  it('осиротілий бюджет під новим id не валить перейменування — перемагає той, що переїжджає', async () => {
    await seed(USER, OLD);
    await db.run(
      `INSERT INTO category_budgets (user_id, category_id, monthly_limit, currency, updated_at) VALUES (?, ?, 1, 'UAH', ?)`,
      [USER, NEW, now()],
    );
    await withTransaction(db, (tx) => moveCategoryReferences(tx, USER, OLD, NEW));

    const rows = await db.all('SELECT category_id AS id, monthly_limit AS lim FROM category_budgets WHERE user_id = ?', [USER]);
    expect(rows).toEqual([{ id: NEW, lim: 3000 }]);
  });
});

describe('releaseCategoryReferences', () => {
  it('операції, підписки й шаблони йдуть в «Інше», а бюджет і правила прибираються', async () => {
    await seed(USER, OLD);
    await withTransaction(db, (tx) => releaseCategoryReferences(tx, USER, OLD, 'other_expense'));

    expect(await references(USER)).toMatchObject({
      transaction: 'other_expense',
      subscription: 'other_expense',
      template: 'other_expense',
      card: 'other_expense',
      budget: undefined,
      alert: undefined,
      pref: undefined,
      rule: undefined,
    });
  });
});
