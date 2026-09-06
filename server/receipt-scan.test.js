import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReceiptScanHandler } from './receipt-scan.js';

const makeReq = (overrides = {}) => ({
  authUserId: 'user-1',
  body: { image: 'a'.repeat(200) },
  ...overrides,
});

const makeRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe('receipt scan handler', () => {
  it('rejects unauthorized requests', async () => {
    const handler = createReceiptScanHandler();
    const res = makeRes();
    await handler(makeReq({ authUserId: '' }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  it('validates image payload before rate limiting', async () => {
    const rateLimitMap = new Map();
    const scanReceiptText = vi.fn().mockResolvedValue({ status: 'ok', text: 'ATB\nСУМА 61' });
    const handler = createReceiptScanHandler({ rateLimitMap, scanReceiptText });

    const invalidRes = makeRes();
    await handler(makeReq({ body: { image: 'short' } }), invalidRes);
    expect(invalidRes.statusCode).toBe(400);
    expect(rateLimitMap.size).toBe(0);

    const validRes = makeRes();
    await handler(makeReq(), validRes);
    expect(scanReceiptText).toHaveBeenCalledTimes(1);
    expect(rateLimitMap.size).toBe(1);
  });

  it('returns local rate limit with retryAfterMs', async () => {
    const rateLimitMap = new Map();
    const scanReceiptText = vi.fn().mockResolvedValue({ status: 'ok', text: 'ATB\nСУМА 61' });
    const handler = createReceiptScanHandler({
      rateLimitMap,
      scanReceiptText,
      nowFn: vi.fn().mockReturnValue(5000),
      rateLimitMs: 3000,
    });

    const firstRes = makeRes();
    await handler(makeReq(), firstRes);
    expect(firstRes.statusCode).toBe(200);

    const secondRes = makeRes();
    await handler(makeReq(), secondRes);
    expect(secondRes.statusCode).toBe(429);
    expect(secondRes.body.retryAfterMs).toBe(3000);
  });

  it('maps OCR misconfiguration to 503', async () => {
    const handler = createReceiptScanHandler({
      rateLimitMap: new Map(),
      scanReceiptText: vi.fn().mockResolvedValue({
        status: 'misconfigured',
        code: 'OCR_NOT_CONFIGURED',
        message: 'Receipt OCR is not configured',
        details: 'missing key',
      }),
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('OCR_NOT_CONFIGURED');
  });

  it('maps OCR timeout to 504', async () => {
    const handler = createReceiptScanHandler({
      rateLimitMap: new Map(),
      scanReceiptText: vi.fn().mockResolvedValue({
        status: 'timeout',
        code: 'OCR_TIMEOUT',
        message: 'OCR provider timeout',
        details: 'timed out',
      }),
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(504);
    expect(res.body.code).toBe('OCR_TIMEOUT');
  });

  it('returns review payload when no text is detected', async () => {
    const handler = createReceiptScanHandler({
      rateLimitMap: new Map(),
      scanReceiptText: vi.fn().mockResolvedValue({
        status: 'no_text',
        code: 'NO_TEXT_DETECTED',
        text: '',
        meta: { elapsedMs: 321 },
      }),
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.scanStatus).toBe('review_required');
    expect(res.body.reviewRequired).toBe(true);
    expect(res.body.code).toBe('NO_TEXT_DETECTED');
  });

  it('returns parsed review status from the parser', async () => {
    const parseReceiptFn = vi.fn().mockReturnValue({
      shop: null,
      total: 44.99,
      currency: 'PLN',
      date: '2026-05-12',
      categoryId: 'food',
      items: [{ name: 'CHIPSY', amount: 44.99 }],
      reviewFlags: ['missing_shop'],
      reviewRequired: true,
    });
    const handler = createReceiptScanHandler({
      rateLimitMap: new Map(),
      parseReceiptFn,
      scanReceiptText: vi.fn().mockResolvedValue({
        status: 'ok',
        code: 'OK',
        text: 'raw ocr',
        meta: { elapsedMs: 250 },
      }),
    });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(parseReceiptFn).toHaveBeenCalledWith('raw ocr');
    expect(res.body.scanStatus).toBe('review_required');
    expect(res.body.rawText).toBe('raw ocr');
    expect(res.body.reviewFlags).toContain('missing_shop');
  });
});

describe('денна квота', () => {
  let db;
  const previousLimit = process.env.QUOTA_RECEIPT_SCAN_PER_DAY;

  beforeEach(async () => {
    const sqlite3 = (await import('sqlite3')).default;
    const { open } = await import('sqlite');
    db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(`CREATE TABLE feature_usage (
      user_id TEXT NOT NULL, feature TEXT NOT NULL, day TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, feature, day))`);
    process.env.QUOTA_RECEIPT_SCAN_PER_DAY = '2';
  });

  afterEach(async () => {
    await db.close();
    if (previousLimit === undefined) delete process.env.QUOTA_RECEIPT_SCAN_PER_DAY;
    else process.env.QUOTA_RECEIPT_SCAN_PER_DAY = previousLimit;
  });

  /** Пауза між сканами тут не цікавить — рухаємо годинник уперед. */
  let clock = 0;
  const call = (handler) => {
    clock += 10_000;
    const res = makeRes();
    return handler(makeReq(), res).then(() => res);
  };

  const okScan = async () => ({ status: 'ok', text: 'СУМА 100.00', meta: {} });

  it('пропускає, поки межа не вичерпана, і показує залишок', async () => {
    const handler = createReceiptScanHandler({ db, scanReceiptText: okScan, nowFn: () => (clock += 10_000) });
    const first = await call(handler);
    expect(first.statusCode).toBe(200);
    expect(first.body.quotaRemaining).toBe(1);
  });

  it('відмовляє після межі — м’яко, з підказкою ввести вручну', async () => {
    const handler = createReceiptScanHandler({ db, scanReceiptText: okScan, nowFn: () => (clock += 10_000) });
    await call(handler);
    await call(handler);
    const third = await call(handler);

    expect(third.statusCode).toBe(429);
    expect(third.body.code).toBe('QUOTA_EXCEEDED');
    // Мовчазна відмова змусила б людину вирішити, що застосунок зламався.
    expect(third.body.error).toMatch(/вручну/);
  });

  it('не витрачає квоту, коли провайдер не налаштований', async () => {
    // Запиту назовні не було — чужого ліміту він не витратив.
    const misconfigured = async () => ({ status: 'misconfigured', message: 'no key', code: 'OCR_NOT_CONFIGURED' });
    const handler = createReceiptScanHandler({ db, scanReceiptText: misconfigured, nowFn: () => (clock += 10_000) });
    await call(handler);
    await call(handler);
    await call(handler);

    const row = await db.get('SELECT used FROM feature_usage');
    expect(row.used).toBe(0);
  });

  it('без бази працює як раніше — квота просто не рахується', async () => {
    const handler = createReceiptScanHandler({ scanReceiptText: okScan, nowFn: () => (clock += 10_000) });
    const res = await call(handler);
    expect(res.statusCode).toBe(200);
    expect(res.body.quotaRemaining).toBeNull();
  });
});
