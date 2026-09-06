import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  REPORT_MAX_ATTEMPTS,
  REPORT_SPREAD_MINUTES,
  claimDueReports,
  enqueueReport,
  failReport,
  jitterMinutes,
  removeReport,
  reportDueAt,
  reportQueueStats,
} from './report-queue.js';

let db;
const NOW = Date.parse('2026-09-07T21:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

beforeEach(async () => {
  db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE report_queue (
      user_id TEXT NOT NULL,
      report_type TEXT NOT NULL,
      slot_key TEXT NOT NULL,
      chat_id INTEGER NOT NULL,
      timezone TEXT,
      due_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, report_type, slot_key)
    )`);
});

afterEach(async () => {
  await db.close();
});

const add = (userId, extra = {}) =>
  enqueueReport(db, {
    userId,
    chatId: Number(userId),
    reportType: 'weekly',
    slotKey: '2026-09-07:21:00',
    timezone: 'Europe/Warsaw',
    dueAt: iso(NOW),
    nowIso: iso(NOW),
    ...extra,
  });

describe('jitterMinutes', () => {
  it('той самий користувач завжди отримує той самий зсув', () => {
    // Інакше повторний такт зсував би звіт по черзі — і той міг би або
    // продублюватися, або загубитися між тактами.
    expect(jitterMinutes('123')).toBe(jitterMinutes('123'));
  });

  it('тримається в межах вікна', () => {
    for (const id of ['1', '999999999', 'abc', '']) {
      const m = jitterMinutes(id);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThan(REPORT_SPREAD_MINUTES);
    }
  });

  it('розкидає людей по вікну, а не збирає в одну хвилину', () => {
    const spread = new Set(Array.from({ length: 500 }, (_, i) => jitterMinutes(`user-${i}`)));
    // Заради цього все й робиться: тисяча звітів не має стати доступною в одну
    // й ту саму секунду.
    expect(spread.size).toBe(REPORT_SPREAD_MINUTES);
  });

  it('нульове вікно вимикає розкид', () => {
    expect(jitterMinutes('42', 0)).toBe(0);
  });
});

describe('reportDueAt', () => {
  it('відсуває момент на власний зсув людини', () => {
    const due = Date.parse(reportDueAt(NOW, '777'));
    expect(due - NOW).toBe(jitterMinutes('777') * 60_000);
  });
});

describe('черга', () => {
  it('приймає звіт і віддає його, коли час настав', async () => {
    expect(await add('1')).toBe(true);
    const due = await claimDueReports(db, { nowIso: iso(NOW) });
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ userId: '1', reportType: 'weekly', chatId: 1 });
  });

  it('не віддає звіт до його часу', async () => {
    await add('1', { dueAt: iso(NOW + 10 * 60_000) });
    expect(await claimDueReports(db, { nowIso: iso(NOW) })).toHaveLength(0);
    expect(await claimDueReports(db, { nowIso: iso(NOW + 11 * 60_000) })).toHaveLength(1);
  });

  it('повторний такт тієї ж хвилини нічого не додає', async () => {
    // Захист від дублів — сам первинний ключ, а не перевірка перед вставкою,
    // яку можна програти в гонці.
    expect(await add('1')).toBe(true);
    expect(await add('1')).toBe(false);
    expect((await reportQueueStats(db, { nowIso: iso(NOW) })).total).toBe(1);
  });

  it('розрізняє тижневий і місячний звіт того самого слота', async () => {
    await add('1', { reportType: 'weekly' });
    await add('1', { reportType: 'monthly' });
    expect((await reportQueueStats(db, { nowIso: iso(NOW) })).total).toBe(2);
  });

  it('віддає найстаріші першими — черга не має ставати LIFO', async () => {
    await add('20', { dueAt: iso(NOW + 5 * 60_000) });
    await add('10', { dueAt: iso(NOW) });
    const due = await claimDueReports(db, { nowIso: iso(NOW + 10 * 60_000), limit: 10 });
    expect(due.map((r) => r.userId)).toEqual(['10', '20']);
  });

  it('поважає межу пачки', async () => {
    for (let i = 0; i < 10; i += 1) await add(String(i));
    expect(await claimDueReports(db, { nowIso: iso(NOW), limit: 3 })).toHaveLength(3);
  });

  it('не ковтає зіпсований рядок разом із дублями', async () => {
    // `INSERT OR IGNORE` приховав би це: звіт просто ніколи б не пішов, і
    // жодного сліду в логах не лишилося б.
    await expect(add('1', { chatId: Number('не число') })).rejects.toThrow(/некоректний chatId/);
  });

  it('успішний звіт зникає з черги', async () => {
    await add('1');
    await removeReport(db, { userId: '1', reportType: 'weekly', slotKey: '2026-09-07:21:00' });
    expect((await reportQueueStats(db, { nowIso: iso(NOW) })).total).toBe(0);
  });
});

describe('failReport', () => {
  const key = { userId: '1', reportType: 'weekly', slotKey: '2026-09-07:21:00' };

  it('відкладає першу невдачу, а не викидає звіт', async () => {
    await add('1');
    expect(await failReport(db, { ...key, attempts: 0, error: 'мережа', nowMs: NOW })).toBe('retry');

    const row = await db.get('SELECT attempts, due_at, last_error FROM report_queue');
    expect(row.attempts).toBe(1);
    expect(Date.parse(row.due_at)).toBeGreaterThan(NOW);
    expect(row.last_error).toBe('мережа');
  });

  it('здається після межі спроб', async () => {
    await add('1');
    expect(await failReport(db, { ...key, attempts: REPORT_MAX_ATTEMPTS - 1, nowMs: NOW })).toBe('dropped');
    expect((await reportQueueStats(db, { nowIso: iso(NOW) })).total).toBe(0);
  });

  it('пауза не виходить за межі вечора', async () => {
    await add('1');
    await failReport(db, { ...key, attempts: 20, nowMs: NOW });
    // Звіт, доставлений уночі, уже майже нікому не потрібен — але й тут межа
    // спроб спрацює раніше, тож рядок просто зникає.
    expect((await reportQueueStats(db, { nowIso: iso(NOW) })).total).toBe(0);
  });
});

describe('reportQueueStats', () => {
  it('рахує все, дозріле й те, що повторюється', async () => {
    await add('1');
    await add('2', { dueAt: iso(NOW + 60 * 60_000) });
    await add('3');
    await failReport(db, { userId: '3', reportType: 'weekly', slotKey: '2026-09-07:21:00', attempts: 0, nowMs: NOW });

    const stats = await reportQueueStats(db, { nowIso: iso(NOW) });
    expect(stats).toEqual({ total: 3, due: 1, retrying: 1 });
  });

  it('на порожній черзі не падає й не віддає null', async () => {
    expect(await reportQueueStats(db, { nowIso: iso(NOW) })).toEqual({ total: 0, due: 0, retrying: 0 });
  });
});
