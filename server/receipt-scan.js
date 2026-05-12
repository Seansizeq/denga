import { parseReceipt } from './receipts.js';
import { scanReceiptTextWithOcrSpace } from './receipt-ocr.js';

export const RECEIPT_SCAN_RATE_LIMIT_MS = 3000;
export const RECEIPT_IMAGE_BYTES_LIMIT = 1024 * 1024;

const lastReceiptScanByUser = new Map();

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

  const result = await scanReceiptText({
    base64,
    mime,
    allowPublicFallback,
  });

  if (result.status === 'misconfigured') {
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
  });
};
