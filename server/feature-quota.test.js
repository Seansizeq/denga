import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  QUOTA_DEFAULTS,
  consumeQuota,
  pruneQuotas,
  quotaDay,
  quotaLimit,
  quotaStats,
  quotaStatus,
  refundQuota,
} from './feature-quota.js';

let db;
const NOW = Date.parse('2026-09-08T12:00:00.000Z');
const saved = {};

beforeEach(async () => {
  db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE feature_usage (
      user_id TEXT NOT NULL,
      feature TEXT NOT NULL,
      day TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, feature, day)
    )`);
  for (const k of ['QUOTA_SMART_TRANSACTION_PER_DAY', 'QUOTA_RECEIPT_SCAN_PER_DAY']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(async () => {
  await db.close();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const take = (userId, feature = 'receipt_scan', nowMs = NOW) =>
  consumeQuota(db, { userId, feature, nowMs });

describe('quotaLimit', () => {
  it('має розумні значення за замовчуванням', () => {
    expect(quotaLimit('receipt_scan')).toBe(QUOTA_DEFAULTS.receipt_scan);
    expect(quotaLimit('smart_transaction')).toBe(QUOTA_DEFAULTS.smart_transaction);
  });

  it('перекривається змінною оточення', () => {
    process.env.QUOTA_RECEIPT_SCAN_PER_DAY = '3';
    expect(quotaLimit('receipt_scan')).toBe(3);
  });

  it('невідома фіча не має квоти — тобто вимкнена', () => {
    expect(quotaLimit('телепатія')).toBe(0);
  });
});

describe('consumeQuota', () => {
  it('пропускає, поки межа не вичерпана', async () => {
    process.env.QUOTA_RECEIPT_SCAN_PER_DAY = '3';
    expect(await take('1')).toMatchObject({ allowed: true, used: 1, remaining: 2 });
    expect(await take('1')).toMatchObject({ allowed: true, used: 2, remaining: 1 });
    expect(await take('1')).toMatchObject({ allowed: true, used: 3, remaining: 0 });
  });

  it('відмовляє після межі', async () => {
    process.env.QUOTA_RECEIPT_SCAN_PER_DAY = '2';
    await take('1');
    await take('1');
    expect(await take('1')).toMatchObject({ allowed: false, remaining: 0 });
  });

  it('рахує спершу, перевіряє потім — інакше два запити разом проскочать', async () => {
    process.env.QUOTA_RECEIPT_SCAN_PER_DAY = '1';
    // Саме тут ховається різниця: перевірка перед збільшенням лишає вікно, у
    // яке обидва паралельні виклики бачать «ще можна».
    const [a, b] = await Promise.all([take('1'), take('1')]);
    expect([a.allowed, b.allowed].filter(Boolean)).toHaveLength(1);
  });

  it('рахує людей окремо', async () => {
    process.env.QUOTA_RECEIPT_SCAN_PER_DAY = '1';
    expect((await take('1')).allowed).toBe(true);
    expect((await take('2')).allowed).toBe(true);
  });

  it('рахує фічі окремо', async () => {
    process.env.QUOTA_RECEIPT_SCAN_PER_DAY = '1';
    process.env.QUOTA_SMART_TRANSACTION_PER_DAY = '1';
    expect((await take('1', 'receipt_scan')).allowed).toBe(true);
    expect((await take('1', 'smart_transaction')).allowed).toBe(true);
  });

  it('новий день починає з нуля', async () => {
    process.env.QUOTA_RECEIPT_SCAN_PER_DAY = '1';
    await take('1');
    expect((await take('1', 'receipt_scan', NOW)).allowed).toBe(false);
    expect((await take('1', 'receipt_scan', NOW + 86_400_000)).allowed).toBe(true);
  });

  it('нульова межа вимикає фічу й не веде обліку', async () => {
    process.env.QUOTA_RECEIPT_SCAN_PER_DAY = '0';
    expect(await take('1')).toMatchObject({ allowed: false, used: 0 });
    expect((await db.get('SELECT COUNT(*) AS n FROM feature_usage')).n).toBe(0);
  });

  it('без користувача нічого не пише', async () => {
    await consumeQuota(db, { userId: '', feature: 'receipt_scan', nowMs: NOW });
    expect((await db.get('SELECT COUNT(*) AS n FROM feature_usage')).n).toBe(0);
  });
});

describe('refundQuota', () => {
  it('повертає одиницю, коли зовнішній виклик не відбувся', async () => {
    process.env.QUOTA_RECEIPT_SCAN_PER_DAY = '2';
    await take('1');
    await refundQuota(db, { userId: '1', feature: 'receipt_scan', nowMs: NOW });
    expect(await quotaStatus(db, { userId: '1', feature: 'receipt_scan', nowMs: NOW })).toMatchObject({ used: 0 });
  });

  it('не заганяє лічильник у мінус', async () => {
    process.env.QUOTA_RECEIPT_SCAN_PER_DAY = '2';
    await take('1');
    await refundQuota(db, { userId: '1', feature: 'receipt_scan', nowMs: NOW });
    await refundQuota(db, { userId: '1', feature: 'receipt_scan', nowMs: NOW });
    expect((await quotaStatus(db, { userId: '1', feature: 'receipt_scan', nowMs: NOW })).used).toBe(0);
  });
});

describe('pruneQuotas', () => {
  it('прибирає старі дні, лишаючи свіжі', async () => {
    process.env.QUOTA_RECEIPT_SCAN_PER_DAY = '5';
    await take('1', 'receipt_scan', NOW - 30 * 86_400_000);
    await take('1', 'receipt_scan', NOW);

    const removed = await pruneQuotas(db, { nowMs: NOW });

    expect(removed).toBe(1);
    const left = await db.all('SELECT day FROM feature_usage');
    expect(left).toEqual([{ day: quotaDay(NOW) }]);
  });
});

describe('quotaStats', () => {
  it('показує, скільки людей і викликів, і скільки вперлося в межу', async () => {
    process.env.QUOTA_RECEIPT_SCAN_PER_DAY = '2';
    await take('1'); await take('1');   // вичерпав
    await take('2');                     // ще ні

    const stats = await quotaStats(db, { nowMs: NOW });
    expect(stats.receipt_scan).toMatchObject({ users: 2, calls: 3, limit: 2, exhausted: 1 });
  });

  it('на порожній базі не падає', async () => {
    expect(await quotaStats(db, { nowMs: NOW })).toBeTypeOf('object');
  });
});
