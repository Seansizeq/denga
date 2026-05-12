import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();

vi.mock('./client', () => ({
  apiFetch,
}));

describe('scanReceipt', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('maps 401 to auth error', async () => {
    apiFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const { scanReceipt } = await import('./receipts');
    const result = await scanReceipt('base64');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('auth');
  });

  it('parses review-required payloads', async () => {
    apiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          shop: null,
          total: 44.99,
          currency: 'PLN',
          date: '2026-05-12',
          categoryId: 'food',
          items: [{ name: 'CHIPSY', amount: 44.99 }],
          reviewFlags: ['missing_shop'],
          reviewRequired: true,
          scanStatus: 'review_required',
          rawText: 'raw',
          code: 'REVIEW_REQUIRED',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const { scanReceipt } = await import('./receipts');
    const result = await scanReceipt('base64');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt.scanStatus).toBe('review_required');
      expect(result.receipt.reviewFlags).toContain('missing_shop');
      expect(result.receipt.rawText).toBe('raw');
    }
  });

  it('preserves retryAfterMs for rate-limited scans', async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ retryAfterMs: 4200 }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const { scanReceipt } = await import('./receipts');
    const result = await scanReceipt('base64');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('rate_limited');
      if (result.error.kind === 'rate_limited') {
        expect(result.error.retryAfterMs).toBe(4200);
      }
    }
  });
});
