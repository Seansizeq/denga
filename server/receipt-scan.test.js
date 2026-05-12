import { describe, expect, it, vi } from 'vitest';
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
