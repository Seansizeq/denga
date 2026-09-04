import { beforeEach, describe, expect, it } from 'vitest';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { dueRemindersQuery, dueReportsQuery } from './auto-reports-schedule.js';

/**
 * Запити такту перевіряються на справжньому SQLite: типи в схемі різні
 * (`users.telegram_id` цілий, `user_id` у налаштуваннях текстовий), і саме на
 * цьому з'єднанні помилка була б невидимою — вибірка просто мовчала б.
 */
const createDb = async () => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE users (
      telegram_id INTEGER PRIMARY KEY,
      chat_id INTEGER,
      timezone TEXT
    );
    CREATE TABLE bot_report_settings (
      user_id TEXT PRIMARY KEY,
      auto_weekly INTEGER NOT NULL DEFAULT 1,
      auto_monthly INTEGER NOT NULL DEFAULT 1,
      report_currency TEXT NOT NULL DEFAULT 'UAH',
      send_time TEXT NOT NULL DEFAULT '21:00',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE user_reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      time_hhmm TEXT NOT NULL DEFAULT '21:00',
      lead_days INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_user_reminders_due ON user_reminders(time_hhmm, enabled);
    CREATE INDEX idx_bot_report_settings_send_time ON bot_report_settings(send_time);
  `);
  return db;
};

const addUser = (db, telegramId, timezone = 'Europe/Kyiv') =>
  db.run('INSERT INTO users (telegram_id, chat_id, timezone) VALUES (?, ?, ?)', [
    telegramId,
    telegramId * 10,
    timezone,
  ]);

const addSettings = (db, telegramId, patch = {}) =>
  db.run(
    `INSERT INTO bot_report_settings (user_id, auto_weekly, auto_monthly, report_currency, send_time, updated_at)
     VALUES (?, ?, ?, 'UAH', ?, '2026-09-04T00:00:00.000Z')`,
    [
      String(telegramId),
      patch.autoWeekly === undefined ? 1 : patch.autoWeekly,
      patch.autoMonthly === undefined ? 1 : patch.autoMonthly,
      patch.sendTime ?? '21:00',
    ],
  );

const addReminder = (db, telegramId, patch = {}) =>
  db.run(
    `INSERT INTO user_reminders (id, user_id, kind, title, enabled, time_hhmm, lead_days, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '2026-09-04T00:00:00.000Z', '2026-09-04T00:00:00.000Z')`,
    [
      patch.id ?? `${telegramId}-${patch.kind ?? 'daily'}`,
      String(telegramId),
      patch.kind ?? 'daily',
      patch.title ?? 'Внести витрати',
      patch.enabled === undefined ? 1 : patch.enabled,
      patch.timeHHMM ?? '21:00',
      patch.leadDays ?? 0,
    ],
  );

const run = (db, { sql, params }) => db.all(sql, params);

describe('dueReportsQuery', () => {
  /** @type {import('sqlite').Database} */
  let db;

  beforeEach(async () => {
    db = await createDb();
  });

  it('finds the users whose send time is the current minute', async () => {
    await addUser(db, 101);
    await addUser(db, 102);
    await addSettings(db, 101, { sendTime: '21:00' });
    await addSettings(db, 102, { sendTime: '09:00' });

    const rows = await run(db, dueReportsQuery(['21:00']));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ telegramId: 101, chatId: 1010, sendTime: '21:00' });
  });

  it('accepts every local time at once', async () => {
    await addUser(db, 101, 'Europe/Kyiv');
    await addUser(db, 102, 'Europe/Warsaw');
    await addSettings(db, 101, { sendTime: '21:00' });
    await addSettings(db, 102, { sendTime: '20:00' });

    const rows = await run(db, dueReportsQuery(['20:00', '21:00']));

    expect(rows.map((row) => row.telegramId)).toEqual([101, 102]);
  });

  it('skips users who turned both reports off', async () => {
    await addUser(db, 101);
    await addSettings(db, 101, { sendTime: '21:00', autoWeekly: 0, autoMonthly: 0 });

    expect(await run(db, dueReportsQuery(['21:00']))).toHaveLength(0);
  });

  it('keeps a user who left only the monthly report on', async () => {
    await addUser(db, 101);
    await addSettings(db, 101, { sendTime: '21:00', autoWeekly: 0, autoMonthly: 1 });

    const rows = await run(db, dueReportsQuery(['21:00']));

    expect(rows).toHaveLength(1);
    expect(rows[0].autoWeekly).toBe(0);
    expect(rows[0].autoMonthly).toBe(1);
  });

  /** Налаштування без користувача — залишок від видаленого акаунта, слати нікуди. */
  it('ignores settings with no user row', async () => {
    await addSettings(db, 999, { sendTime: '21:00' });

    expect(await run(db, dueReportsQuery(['21:00']))).toHaveLength(0);
  });

  it('reads the timezone the reply has to be checked against', async () => {
    await addUser(db, 101, 'America/New_York');
    await addSettings(db, 101, { sendTime: '21:00' });

    const rows = await run(db, dueReportsQuery(['21:00']));

    expect(rows[0].timezone).toBe('America/New_York');
  });

  it('uses the index instead of walking the table', async () => {
    await addUser(db, 101);
    await addSettings(db, 101, { sendTime: '21:00' });
    const { sql, params } = dueReportsQuery(['21:00']);

    const plan = await db.all(`EXPLAIN QUERY PLAN ${sql}`, params);
    const detail = plan.map((row) => row.detail).join(' | ');

    expect(detail).toContain('idx_bot_report_settings_send_time');
    expect(detail).not.toContain('SCAN bot_report_settings');
  });
});

describe('dueRemindersQuery', () => {
  /** @type {import('sqlite').Database} */
  let db;

  beforeEach(async () => {
    db = await createDb();
  });

  it('returns the enabled reminders for the current minute', async () => {
    await addUser(db, 101);
    await addReminder(db, 101, { kind: 'daily', timeHHMM: '21:00' });
    await addReminder(db, 101, { kind: 'subscriptions', timeHHMM: '10:00', leadDays: 1 });

    const rows = await run(db, dueRemindersQuery(['21:00']));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'daily', timeHHMM: '21:00', telegramId: 101, chatId: 1010 });
  });

  it('leaves a disabled reminder alone', async () => {
    await addUser(db, 101);
    await addReminder(db, 101, { kind: 'daily', timeHHMM: '21:00', enabled: 0 });

    expect(await run(db, dueRemindersQuery(['21:00']))).toHaveLength(0);
  });

  it('carries the lead days the reminder needs', async () => {
    await addUser(db, 101);
    await addReminder(db, 101, { kind: 'inactivity', timeHHMM: '20:00', leadDays: 3 });

    const rows = await run(db, dueRemindersQuery(['20:00']));

    expect(rows[0].leadDays).toBe(3);
  });

  it('returns reminders of several users in one pass', async () => {
    await addUser(db, 101);
    await addUser(db, 102);
    await addReminder(db, 101, { kind: 'daily', timeHHMM: '21:00' });
    await addReminder(db, 102, { kind: 'daily', timeHHMM: '21:00' });
    await addReminder(db, 102, { kind: 'shift_unclosed', timeHHMM: '23:00' });

    const rows = await run(db, dueRemindersQuery(['21:00', '23:00']));

    expect(rows.map((row) => [row.telegramId, row.kind])).toEqual([
      [101, 'daily'],
      [102, 'daily'],
      [102, 'shift_unclosed'],
    ]);
  });

  it('ignores a reminder whose user is gone', async () => {
    await addReminder(db, 999, { kind: 'daily', timeHHMM: '21:00' });

    expect(await run(db, dueRemindersQuery(['21:00']))).toHaveLength(0);
  });

  it('uses the index instead of walking the table', async () => {
    await addUser(db, 101);
    await addReminder(db, 101, { kind: 'daily', timeHHMM: '21:00' });
    const { sql, params } = dueRemindersQuery(['21:00']);

    const plan = await db.all(`EXPLAIN QUERY PLAN ${sql}`, params);
    const detail = plan.map((row) => row.detail).join(' | ');

    expect(detail).toContain('idx_user_reminders_due');
    expect(detail).not.toContain('SCAN user_reminders');
  });
});
