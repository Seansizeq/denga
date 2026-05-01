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
  | { kind: 'not_configured'; status?: number; details?: string }
  | { kind: 'rate_limited'; retryAfterMs: number; status?: number; details?: string }
  | { kind: 'invalid'; status?: number; details?: string }
  | { kind: 'too_large'; status?: number; details?: string }
  | { kind: 'provider'; status?: number; details?: string }
  | { kind: 'network'; status?: number; details?: string }
  | { kind: 'unknown'; status?: number; details?: string };

export interface ScanReceiptResult {
  ok: true;
  receipt: ScannedReceipt;
}

export interface ScanReceiptFailure {
  ok: false;
  error: ScanReceiptError;
}

const readBodySnippet = async (response: Response): Promise<string> => {
  try {
    const text = await response.text();
    return text.length > 240 ? `${text.slice(0, 240)}…` : text;
  } catch {
    return '';
  }
};

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
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'network',
        details: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const status = response.status;

  if (status === 503) {
    const details = await readBodySnippet(response);
    return { ok: false, error: { kind: 'not_configured', status, details } };
  }
  if (status === 413) {
    const details = await readBodySnippet(response);
    return { ok: false, error: { kind: 'too_large', status, details } };
  }
  if (status === 400) {
    const details = await readBodySnippet(response);
    return { ok: false, error: { kind: 'invalid', status, details } };
  }
  if (status === 429) {
    let retryAfterMs = 3000;
    let details = '';
    try {
      const text = await response.text();
      details = text.slice(0, 240);
      const data = JSON.parse(text) as { retryAfterMs?: number };
      if (typeof data.retryAfterMs === 'number') retryAfterMs = data.retryAfterMs;
    } catch {
      /* ignore */
    }
    return { ok: false, error: { kind: 'rate_limited', retryAfterMs, status, details } };
  }
  if (status === 502) {
    const details = await readBodySnippet(response);
    return { ok: false, error: { kind: 'provider', status, details } };
  }
  if (status === 504) {
    const details = await readBodySnippet(response);
    return { ok: false, error: { kind: 'provider', status, details } };
  }
  if (!response.ok) {
    const details = await readBodySnippet(response);
    return { ok: false, error: { kind: 'unknown', status, details } };
  }

  try {
    const data = (await response.json()) as ScannedReceipt;
    return { ok: true, receipt: data };
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'unknown',
        status,
        details: err instanceof Error ? err.message : String(err),
      },
    };
  }
};
