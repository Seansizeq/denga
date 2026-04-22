import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(__dirname, '../database.sqlite');

export async function initDb() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
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
    CREATE TABLE IF NOT EXISTS planner_days (
      day TEXT PRIMARY KEY,
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
    ON custom_categories(type, normalized_name)
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
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

  return db;
}
