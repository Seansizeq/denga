import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveDebtDirectionForMigration } from './debt-direction.js';
import { runCryptoDenominationMigration } from './crypto-denomination-migration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const getDatabasePath = () =>
  process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.resolve(__dirname, '../database.sqlite');

export async function removeRetiredBybitIntegration(db) {
  const assetLinksTable = await db.get(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'bybit_asset_accounts'",
  );
  await db.run('BEGIN IMMEDIATE');
  try {
    if (assetLinksTable) {
      // Only remove accounts explicitly linked by the retired integration.
      // Older user-created Bybit/Card/overall accounts have no link row and remain untouched.
      await db.run(
        `DELETE FROM account_portfolio
         WHERE EXISTS (
           SELECT 1 FROM bybit_asset_accounts links
           WHERE links.user_id = account_portfolio.user_id
             AND links.account_key = account_portfolio.account_key
         )`,
      );
    }
    await db.exec(`
      DROP TABLE IF EXISTS bybit_card_imports;
      DROP TABLE IF EXISTS bybit_asset_accounts;
      DROP TABLE IF EXISTS bybit_card_connections;
    `);
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }
}

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
  await db.exec(`
    CREATE TABLE IF NOT EXISTS reminder_deliveries (
      user_id TEXT NOT NULL,
      reminder_id TEXT NOT NULL,
      slot_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, reminder_id, slot_key)
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
  try {
    await db.exec(`ALTER TABLE subscriptions ADD COLUMN icon TEXT`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE subscriptions ADD COLUMN color TEXT`);
  } catch {
    /* already exists */
  }

  // Курси й ціни, які пережили б перезапуск. Раніше вони лежали тільки в
  // пам'яті процесу: після кожного деплою застосунок лишався без цін на крипту
  // доти, доки не відповість CoinGecko.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS planner_user_settings (
      user_id TEXT PRIMARY KEY,
      default_shift_template_id TEXT,
      automation_token TEXT,
      updated_at TEXT NOT NULL
    )
  `);
  try {
    await db.exec(`ALTER TABLE planner_user_settings ADD COLUMN automation_token TEXT`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE planner_user_settings ADD COLUMN default_shift_template_id TEXT`);
  } catch {
    /* already exists */
  }

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
    CREATE TABLE IF NOT EXISTS planner_shift_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      day TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      worked_hours REAL NOT NULL DEFAULT 0,
      salary_rate REAL NOT NULL DEFAULT 0,
      salary_amount REAL NOT NULL DEFAULT 0,
      salary_currency TEXT NOT NULL DEFAULT 'UAH',
      note TEXT NOT NULL DEFAULT '',
      template_id TEXT,
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
  try {
    await db.exec(`ALTER TABLE account_portfolio ADD COLUMN icon_key TEXT`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE account_portfolio ADD COLUMN debt_direction TEXT`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE account_portfolio ADD COLUMN debt_initial_amount REAL`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE account_portfolio ADD COLUMN debt_created_at TEXT`);
  } catch {
    /* already exists */
  }
  await db.exec(`
    CREATE TABLE IF NOT EXISTS debt_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      debt_account_key TEXT NOT NULL,
      event_type TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      payment_account_key TEXT,
      transaction_id TEXT,
      date TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_debt_events_account
    ON debt_events(user_id, debt_account_key, date DESC)
  `);
  try {
    await db.exec(`ALTER TABLE transactions ADD COLUMN debtEventId TEXT`);
  } catch {
    /* already exists */
  }
  await db.run(
    `UPDATE account_portfolio
     SET debt_initial_amount = primary_amount + COALESCE((
           SELECT SUM(t.amount)
           FROM transactions t
           WHERE t.user_id = account_portfolio.user_id
             AND t.categoryId = 'debt_return'
             AND (t.fromAccountKey = account_portfolio.account_key OR t.toAccountKey = account_portfolio.account_key)
         ), 0),
         debt_created_at = COALESCE(debt_created_at, updatedAt)
     WHERE section = 'debt' AND debt_initial_amount IS NULL`
  );
  await db.run(
    `INSERT INTO debt_events
      (id, user_id, debt_account_key, event_type, amount, currency, date, note, created_at)
     SELECT lower(hex(randomblob(16))), a.user_id, a.account_key, 'created',
            COALESCE(a.debt_initial_amount, a.primary_amount), a.primary_currency,
            COALESCE(a.debt_created_at, a.updatedAt), 'Migrated opening balance',
            COALESCE(a.debt_created_at, a.updatedAt)
     FROM account_portfolio a
     WHERE a.section = 'debt'
       AND NOT EXISTS (
         SELECT 1 FROM debt_events e
         WHERE e.user_id = a.user_id AND e.debt_account_key = a.account_key
       )`
  );
  // Infer the direction only for genuinely legacy rows. An explicit modern value
  // must never be overwritten by stale debt_phrase text on a later server restart.
  {
    const debtRows = await db.all(
      `SELECT account_key AS accountKey,
              debt_phrase AS debtPhrase,
              debt_direction AS debtDirection
       FROM account_portfolio
       WHERE section = 'debt'`
    );
    for (const row of debtRows) {
      const resolved = resolveDebtDirectionForMigration(row);
      if (!resolved.shouldUpdate) continue;
      await db.run(
        `UPDATE account_portfolio SET debt_direction = ? WHERE account_key = ?`,
        [resolved.direction, row.accountKey]
      );
    }
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

  // Quick-entry templates for the add-transaction screen. Server-side so they
  // follow the user across devices like everything else they own.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS expense_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL,
      currency TEXT NOT NULL DEFAULT 'UAH',
      category_id TEXT NOT NULL,
      note TEXT,
      account_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_expense_templates_user
    ON expense_templates(user_id, created_at DESC)
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
  try {
    await db.exec(`ALTER TABLE goals ADD COLUMN type TEXT NOT NULL DEFAULT 'savings'`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE goal_contributions ADD COLUMN currency TEXT`);
  } catch {
    /* already exists */
  }
  try {
    await db.exec(`ALTER TABLE goal_contributions ADD COLUMN source TEXT`);
  } catch {
    /* already exists */
  }
  // Progress a goal starts with — money already earned or already put aside
  // before the goal existed. Counts toward the bar, never a transaction.
  try {
    await db.exec(`ALTER TABLE goals ADD COLUMN baseline_amount REAL NOT NULL DEFAULT 0`);
  } catch {
    /* already exists */
  }

  await removeRetiredBybitIntegration(db);

  // Turn legacy free-text crypto positions into real balances. Takes its own
  // file backup first and is a no-op once every crypto account is already
  // denominated in its asset.
  await runCryptoDenominationMigration(db, dbPath);

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
    CREATE INDEX IF NOT EXISTS idx_planner_shift_entries_user_day
    ON planner_shift_entries(user_id, day, ended_at DESC)
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_accounts_user_sort
    ON account_portfolio(user_id, sort_index)
  `);

  return db;
}
