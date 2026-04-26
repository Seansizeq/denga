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

  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UAH',
      categoryId TEXT NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      telegram_user_id INTEGER
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      chat_id INTEGER NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS bot_active_shifts (
      user_id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      started_day TEXT NOT NULL,
      template_id TEXT,
      salary_rate REAL NOT NULL DEFAULT 0,
      salary_amount REAL NOT NULL DEFAULT 0,
      salary_currency TEXT NOT NULL DEFAULT 'UAH',
      shift_note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )
  `);
  try {
    await db.exec(`ALTER TABLE bot_active_shifts ADD COLUMN template_id TEXT`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE bot_active_shifts ADD COLUMN salary_rate REAL NOT NULL DEFAULT 0`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE bot_active_shifts ADD COLUMN salary_amount REAL NOT NULL DEFAULT 0`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE bot_active_shifts ADD COLUMN salary_currency TEXT NOT NULL DEFAULT 'UAH'`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE bot_active_shifts ADD COLUMN shift_note TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* already exists */
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS planner_days (
      day TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      hasShift INTEGER NOT NULL DEFAULT 0,
      workedHours REAL NOT NULL DEFAULT 0,
      salaryRate REAL NOT NULL DEFAULT 0,
      salaryAmount REAL NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL
    )
  `);

  // Backward-compatible migration for existing databases.
  try {
    await db.exec('ALTER TABLE planner_days ADD COLUMN workedHours REAL NOT NULL DEFAULT 0');
  } catch {
    // Column already exists.
  }

  try {
    await db.exec(`ALTER TABLE planner_days ADD COLUMN salary_currency TEXT NOT NULL DEFAULT 'UAH'`);
  } catch {
    /* already exists */
  }

  try {
    await db.exec(`ALTER TABLE planner_shift_templates ADD COLUMN currency TEXT NOT NULL DEFAULT 'UAH'`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE planner_shift_templates ADD COLUMN salary_rate REAL NOT NULL DEFAULT 0`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE planner_shift_templates ADD COLUMN salary_amount REAL NOT NULL DEFAULT 0`);
  } catch {
    /* already exists */
  }

  try {
    await db.exec(
      `UPDATE planner_shift_templates SET normalized_key = normalized_key || '::UAH'
       WHERE normalized_key NOT LIKE '%::UAH' AND normalized_key NOT LIKE '%::PLN'
         AND normalized_key LIKE '%::%' AND normalized_key NOT LIKE '%::%::%'`
    );
  } catch {
    /* ignore */
  }

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
      cycle TEXT NOT NULL,
      nextChargeDate TEXT NOT NULL,
      note TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS planner_shift_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      normalized_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      symbol TEXT NOT NULL DEFAULT '',
      is_full_day INTEGER NOT NULL DEFAULT 1,
      start_time TEXT NOT NULL DEFAULT '09:00',
      end_time TEXT NOT NULL DEFAULT '17:00',
      worked_hours REAL NOT NULL DEFAULT 8,
      salary_rate REAL NOT NULL DEFAULT 0,
      salary_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

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
    await db.exec(`ALTER TABLE planner_days ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE planner_shift_templates ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE account_portfolio ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
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
    CREATE INDEX IF NOT EXISTS idx_planner_days_user_day
    ON planner_days(user_id, day)
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_planner_shift_templates_user
    ON planner_shift_templates(user_id, updated_at DESC)
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_accounts_user_sort
    ON account_portfolio(user_id, sort_index)
  `);

  return db;
}
