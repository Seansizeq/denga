import { parseReceipt } from './receipts.js';
import { scanReceiptTextWithOcrSpace } from './receipt-ocr.js';
import { createExpiringMap } from './expiring-map.js';
import { consumeQuota, refundQuota } from './feature-quota.js';

export const RECEIPT_SCAN_RATE_LIMIT_MS = 3000;
export const RECEIPT_IMAGE_BYTES_LIMIT = 1024 * 1024;

/**
 * Позначки часу останнього скану — лише щоб витримати паузу в три секунди.
 * Звичайна `Map` тримала б рядок на кожного, хто бодай раз сканував чек, до
 * самого перезапуску; тут запис живе рівно стільки, скільки має значення.
 * Тести підставляють сюди свою мапу через `rateLimitMap`.
 */
const lastReceiptScanByUser = createExpiringMap({ ttlMs: 5 * 60 * 1000 });

export const stripBase64Prefix = (raw) => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^data:image\/(jpeg|jpg|png|webp|heic|heif);base64,([\s\S]+)$/i);
  if (match) return { mime: match[1].toLowerCase(), data: match[2].replace(/\s+/g, '') };
  return { mime: 'jpeg', data: trimmed.replace(/\s+/g, '') };
};

const emptyReceiptPayload = (patch = {}) => ({
  shop: null,
  total: null,
  currency: 'UAH',
  date: null,
  categoryId: 'other_expense',
  items: [],
  rawText: '',
  reviewFlags: ['no_text_detected'],
  reviewRequired: true,
  scanStatus: 'review_required',
  code: 'NO_TEXT_DETECTED',
  ...patch,
});

export const createReceiptScanHandler = ({
  parseReceiptFn = parseReceipt,
  scanReceiptText = scanReceiptTextWithOcrSpace,
  rateLimitMap = lastReceiptScanByUser,
  nowFn = () => Date.now(),
  rateLimitMs = RECEIPT_SCAN_RATE_LIMIT_MS,
  imageBytesLimit = RECEIPT_IMAGE_BYTES_LIMIT,
  allowPublicFallback,
  /** База для денної квоти. Без неї квота не рахується — так працюють старі тести. */
  db = null,
} = {}) => async (req, res) => {
  const userId = String(req.authUserId ?? '');
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
    return;
  }

  const parsedImage = stripBase64Prefix(req.body?.image);
  const base64 = parsedImage?.data ?? '';
  const mime = parsedImage?.mime ?? 'jpeg';
  if (!base64 || base64.length < 100) {
    res.status(400).json({ error: 'image is required (base64)', code: 'INVALID_IMAGE' });
    return;
  }

  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > imageBytesLimit) {
    res.status(413).json({
      error: 'image too large (max ~1 MB after compression)',
      code: 'IMAGE_TOO_LARGE',
    });
    return;
  }

  const now = nowFn();
  const last = rateLimitMap.get(userId) ?? 0;
  if (now - last < rateLimitMs) {
    res.status(429).json({
      error: 'Too many scan requests, slow down',
      code: 'RATE_LIMITED',
      retryAfterMs: rateLimitMs - (now - last),
    });
    return;
  }
  rateLimitMap.set(userId, now);

  /**
   * Денна квота. Пауза в три секунди вище рятує від випадкового потоку, але не
   * від людини, яка за день сканує сотні зображень: місячний ліміт OCR.space
   * спільний на весь застосунок, і вичерпає його одна людина для всіх.
   */
  let quota = null;
  if (db) {
    quota = await consumeQuota(db, { userId, feature: 'receipt_scan' });
    if (!quota.allowed) {
      res.status(429).json({
        error: 'Ліміт розпізнавань на сьогодні вичерпано. Спробуйте завтра або введіть суму вручну.',
        code: 'QUOTA_EXCEEDED',
        limit: quota.limit,
        resetsIn: 'сьогодні опівночі UTC',
      });
      return;
    }
  }

  /** Виклик до провайдера не відбувся — квоту не витрачено, повертаємо. */
  const refundIfUnused = async () => {
    if (db) await refundQuota(db, { userId, feature: 'receipt_scan' });
  };

  const result = await scanReceiptText({
    base64,
    mime,
    allowPublicFallback,
  });

  if (result.status === 'misconfigured') {
    // Ключа немає — запиту назовні теж не було.
    await refundIfUnused();
    res.status(503).json({
      error: result.message,
      code: result.code,
      details: result.details,
    });
    return;
  }

  if (result.status === 'rate_limited') {
    res.status(429).json({
      error: result.message,
      code: result.code,
      details: result.details,
      retryAfterMs: result.retryAfterMs ?? 3000,
    });
    return;
  }

  if (result.status === 'timeout') {
    res.status(504).json({
      error: result.message,
      code: result.code,
      details: result.details,
    });
    return;
  }

  if (result.status === 'provider_error' || result.status === 'unreachable') {
    res.status(502).json({
      error: result.message,
      code: result.code,
      details: result.details,
    });
    return;
  }

  if (result.status === 'no_text') {
    res.status(200).json(emptyReceiptPayload({
      code: result.code,
      ocrMeta: result.meta,
    }));
    return;
  }

  const parsed = parseReceiptFn(result.text);
  res.status(200).json({
    ...parsed,
    rawText: result.text,
    scanStatus: parsed.reviewRequired ? 'review_required' : 'ok',
    code: parsed.reviewRequired ? 'REVIEW_REQUIRED' : 'OK',
    ocrMeta: result.meta,
    // Скільки лишилося сьогодні — щоб застосунок міг попередити заздалегідь,
    // а не лише в момент відмови.
    quotaRemaining: quota?.remaining ?? null,
  });
};
