import { apiFetch } from './client';
import type { CurrencyCode } from '../utils/currency';

export interface ScannedReceiptItem {
  name: string;
  amount: number;
}

export interface ScannedReceipt {
  shop: string | null;
  total: number | null;
  currency: CurrencyCode;
  date: string | null;
  categoryId: string;
  items: ScannedReceiptItem[];
  rawText?: string;
  code?: string;
}

export type ScanReceiptError =
  | { kind: 'not_configured' }
  | { kind: 'rate_limited'; retryAfterMs: number }
  | { kind: 'invalid' }
  | { kind: 'too_large' }
  | { kind: 'provider' }
  | { kind: 'network' }
  | { kind: 'unknown' };

export interface ScanReceiptResult {
  ok: true;
  receipt: ScannedReceipt;
}

export interface ScanReceiptFailure {
  ok: false;
  error: ScanReceiptError;
}

export const scanReceipt = async (
  imageBase64: string
): Promise<ScanReceiptResult | ScanReceiptFailure> => {
  let response: Response;
  try {
    response = await apiFetch('/api/receipts/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 }),
    });
  } catch {
    return { ok: false, error: { kind: 'network' } };
  }

  if (response.status === 503) return { ok: false, error: { kind: 'not_configured' } };
  if (response.status === 413) return { ok: false, error: { kind: 'too_large' } };
  if (response.status === 400) return { ok: false, error: { kind: 'invalid' } };
  if (response.status === 429) {
    let retryAfterMs = 3000;
    try {
      const data = (await response.json()) as { retryAfterMs?: number };
      if (typeof data.retryAfterMs === 'number') retryAfterMs = data.retryAfterMs;
    } catch {
      /* ignore */
    }
    return { ok: false, error: { kind: 'rate_limited', retryAfterMs } };
  }
  if (response.status === 502) return { ok: false, error: { kind: 'provider' } };
  if (!response.ok) return { ok: false, error: { kind: 'unknown' } };

  try {
    const data = (await response.json()) as ScannedReceipt;
    return { ok: true, receipt: data };
  } catch {
    return { ok: false, error: { kind: 'unknown' } };
  }
};
