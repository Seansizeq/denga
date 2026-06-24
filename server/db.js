import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const getDatabasePath = () =>
  process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.resolve(__dirname, '../database.sqlite');

export async function initDb() {
  const dbPath = getDatabasePath();
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Durability: fewer torn writes on crash; WAL allows safer concurrent read during backup.
  try {
    await db.exec('PRAGMA journal_mode = WAL');
    await db.exec('PRAGMA synchronous = FULL');
    await db.exec('PRAGMA busy_timeout = 8000');
  } catch (e) {
    console.error('[db] PRAGMA setup failed', e);
  }

  // Shift planner feature removed — drop its tables if they still exist from older versions.
  for (const t of [
    'planner_days',
    'planner_shift_entries',
    'planner_shift_templates',
    'planner_user_settings',
    'bot_active_shifts',
  ]) {
    try {
      await db.exec(`DROP TABLE IF EXISTS ${t}`);
    } catch {
      /* ignore */
    }
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UAH',
      transferToAmount REAL,
      transferToCurrency TEXT,
      categoryId TEXT NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      fromAccountKey TEXT,
      toAccountKey TEXT,
      telegram_user_id INTEGER
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      chat_id INTEGER NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Europe/Warsaw'
    )
  `);
  try {
    await db.exec(`ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Warsaw'`);
  } catch {
    /* already exists */
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS bot_report_settings (
      user_id TEXT PRIMARY KEY,
      auto_weekly INTEGER NOT NULL DEFAULT 1,
      auto_monthly INTEGER NOT NULL DEFAULT 1,
      report_currency TEXT NOT NULL DEFAULT 'UAH',
      send_time TEXT NOT NULL DEFAULT '21:00',
      updated_at TEXT NOT NULL
    )
  `);
  try {
    await db.exec(`ALTER TABLE bot_report_settings ADD COLUMN report_currency TEXT NOT NULL DEFAULT 'UAH'`);
  } catch {
    /* already exists */
  }
  await db.exec(`
    CREATE TABLE IF NOT EXISTS bot_report_deliveries (
      user_id TEXT NOT NULL,
      report_type TEXT NOT NULL,
      slot_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, report_type, slot_key)
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      time_hhmm TEXT NOT NULL DEFAULT '21:00',
      lead_days INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  // Shift planner removed — drop its reminder rows so they never appear or fire.
  await db.exec(`DELETE FROM user_reminders WHERE kind IN ('shift_evening_before', 'shift_unclosed')`);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS reminder_deliveries (
      user_id TEXT NOT NULL,
      reminder_id TEXT NOT NULL,
      slot_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, reminder_id, slot_key)
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS custom_categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_categories_type_name
    ON custom_categories(user_id, type, normalized_name)
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UAH',
      categoryId TEXT NOT NULL DEFAULT 'other_expense',
      cycle TEXT NOT NULL,
      nextChargeDate TEXT NOT NULL,
      note TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  try {
    await db.exec(`ALTER TABLE subscriptions ADD COLUMN currency TEXT NOT NULL DEFAULT 'UAH'`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE subscriptions ADD COLUMN categoryId TEXT NOT NULL DEFAULT 'other_expense'`);
  } catch {
    /* already exists */
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS account_portfolio (
      account_key TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      section TEXT NOT NULL,
      sort_index INTEGER NOT NULL,
      name TEXT NOT NULL,
      primary_amount REAL NOT NULL,
      primary_currency TEXT NOT NULL,
      sub_text TEXT,
      icon_tone TEXT NOT NULL,
      badge TEXT,
      debt_phrase TEXT,
      updatedAt TEXT NOT NULL
    )
  `);

  try {
    await db.exec(`ALTER TABLE transactions ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'UAH'`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE transactions ADD COLUMN transferToAmount REAL`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE transactions ADD COLUMN transferToCurrency TEXT`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE transactions ADD COLUMN fromAccountKey TEXT`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE transactions ADD COLUMN toAccountKey TEXT`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE custom_categories ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE subscriptions ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE account_portfolio ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE account_portfolio ADD COLUMN icon_key TEXT`);
  } catch {
    /* already exists */
  }
  // Remove legacy seed rows (user_id='') that block real users from creating accounts with matching keys
  await db.run(`DELETE FROM account_portfolio WHERE user_id = ''`);
  try {
    await db.exec(`ALTER TABLE users ADD COLUMN fx_baseline_json TEXT`);
  } catch {
    /* already exists */
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS category_budgets (
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      monthly_limit REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UAH',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, category_id)
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS budget_alerts (
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      year_month TEXT NOT NULL,
      level TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, category_id, year_month, level)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UAH',
      deadline TEXT,
      icon TEXT NOT NULL DEFAULT 'target',
      color TEXT NOT NULL DEFAULT '#7C5CFF',
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS goal_contributions (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_goal_contrib_goal ON goal_contributions(goal_id)
  `);
  try {
    await db.exec(`ALTER TABLE goal_contributions ADD COLUMN transaction_id TEXT`);
  } catch {
    /* already exists */
  }

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_user_date
    ON transactions(user_id, date DESC)
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active
    ON subscriptions(user_id, active)
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_accounts_user_sort
    ON account_portfolio(user_id, sort_index)
  `);

  return db;
}
