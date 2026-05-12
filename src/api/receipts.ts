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
  reviewFlags: string[];
  reviewRequired: boolean;
  scanStatus: 'ok' | 'review_required';
  ocrMeta?: {
    usedFallbackLanguage?: boolean;
    elapsedMs?: number;
    usedPublicFallback?: boolean;
  };
}

export type ScanReceiptError =
  | { kind: 'not_configured'; status?: number; details?: string }
  | { kind: 'auth'; status?: number; details?: string }
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

  if (status === 401) {
    const details = await readBodySnippet(response);
    return { ok: false, error: { kind: 'auth', status, details } };
  }
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
    const data = (await response.json()) as Partial<ScannedReceipt>;
    return {
      ok: true,
      receipt: {
        shop: data.shop ?? null,
        total: typeof data.total === 'number' ? data.total : null,
        currency: data.currency === 'PLN' || data.currency === 'USD' ? data.currency : 'UAH',
        date: data.date ?? null,
        categoryId: typeof data.categoryId === 'string' && data.categoryId ? data.categoryId : 'other_expense',
        items: Array.isArray(data.items)
          ? data.items
              .filter((row): row is ScannedReceiptItem => Boolean(row && typeof row === 'object'))
              .map((row) => ({
                name: String(row.name ?? '').slice(0, 60),
                amount: Number(row.amount ?? 0),
              }))
              .filter((row) => row.name && Number.isFinite(row.amount) && row.amount > 0)
          : [],
        rawText: typeof data.rawText === 'string' ? data.rawText : undefined,
        code: typeof data.code === 'string' ? data.code : undefined,
        reviewFlags: Array.isArray(data.reviewFlags) ? data.reviewFlags.map((flag) => String(flag)) : [],
        reviewRequired: Boolean(data.reviewRequired),
        scanStatus: data.scanStatus === 'ok' ? 'ok' : 'review_required',
        ocrMeta: data.ocrMeta && typeof data.ocrMeta === 'object' ? data.ocrMeta : undefined,
      },
    };
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
