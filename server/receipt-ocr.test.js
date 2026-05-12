import { describe, expect, it, vi } from 'vitest';
import { scanReceiptTextWithOcrSpace } from './receipt-ocr.js';

const okResponse = (json) => ({
  ok: true,
  json: async () => json,
  text: async () => JSON.stringify(json),
  headers: { get: () => null },
});

describe('scanReceiptTextWithOcrSpace', () => {
  it('returns misconfigured when no key is available', async () => {
    const result = await scanReceiptTextWithOcrSpace({
      base64: 'a'.repeat(200),
      apiKey: '',
      allowPublicFallback: false,
      fetchImpl: vi.fn(),
    });
    expect(result.status).toBe('misconfigured');
  });

  it('retries without language when auto is rejected', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async (_url, init) => {
        expect(init.body.get('language')).toBe('auto');
        return okResponse({
          IsErroredOnProcessing: true,
          ErrorMessage: ['E201 invalid language'],
          ErrorDetails: 'invalid language',
        });
      })
      .mockImplementationOnce(async (_url, init) => {
        expect(init.body.get('language')).toBeNull();
        return okResponse({
          IsErroredOnProcessing: false,
          ParsedResults: [{ ParsedText: 'Biedronka\nRAZEM PLN 10,49' }],
        });
      });

    const result = await scanReceiptTextWithOcrSpace({
      base64: 'a'.repeat(200),
      apiKey: 'private-key',
      fetchImpl,
    });

    expect(result.status).toBe('ok');
    expect(result.text).toContain('RAZEM PLN 10,49');
    expect(result.meta.usedFallbackLanguage).toBe(true);
  });

  it('returns no_text when OCR succeeds but text is empty', async () => {
    const result = await scanReceiptTextWithOcrSpace({
      base64: 'a'.repeat(200),
      apiKey: 'private-key',
      fetchImpl: vi.fn().mockResolvedValue(
        okResponse({
          IsErroredOnProcessing: false,
          ParsedResults: [{ ParsedText: '' }],
        })
      ),
    });
    expect(result.status).toBe('no_text');
    expect(result.code).toBe('NO_TEXT_DETECTED');
  });
});
