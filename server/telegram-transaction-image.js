import { scanReceiptTextWithOcrSpace } from './receipt-ocr.js';
import { parseSmartTransaction } from './smart-transaction.js';

// Keep this aligned with the receipt scanner: OCR providers on the inexpensive
// plan reject larger payloads, while Telegram's compressed screenshots usually
// stay comfortably below this threshold.
export const TELEGRAM_TRANSACTION_IMAGE_BYTES_LIMIT = 1024 * 1024;

const SUPPORTED_DOCUMENT_MIME = new Map([
  ['image/jpeg', 'jpeg'],
  ['image/jpg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

const finiteSize = (value) => {
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? size : null;
};

/**
 * Telegram sends compressed images in `photo` (several sizes) and originals in
 * `document`. Keep the transport detail outside the bot handler so both paths
 * get the same validation and tests.
 */
export const getTelegramTransactionImage = (message) => {
  const photos = Array.isArray(message?.photo) ? message.photo.filter((item) => item?.file_id) : [];
  if (photos.length > 0) {
    const largest = photos.reduce((best, item) => {
      const area = Number(item.width || 0) * Number(item.height || 0);
      const bestArea = Number(best.width || 0) * Number(best.height || 0);
      return area >= bestArea ? item : best;
    });
    return {
      fileId: String(largest.file_id),
      mime: 'jpeg',
      size: finiteSize(largest.file_size),
      source: 'photo',
    };
  }

  const document = message?.document;
  const mime = SUPPORTED_DOCUMENT_MIME.get(String(document?.mime_type || '').toLowerCase());
  if (!document?.file_id || !mime) return null;
  return {
    fileId: String(document.file_id),
    mime,
    size: finiteSize(document.file_size),
    source: 'document',
  };
};

export const buildTransactionScreenshotOcrText = (ocrText) => [
  'Це OCR-текст одного банківського скріншота з деталями операції.',
  'Розпізнай саме суму списання або зарахування, продавця, дату й категорію.',
  'Не використовуй як amount баланс після операції, власні кошти, курс або номер картки.',
  'Якщо показані сума списання у валюті рахунку та менша початкова сума в іншій валюті, обирай суму списання у валюті рахунку.',
  'Якщо біля головної суми стоїть мінус — це expense; плюс або зарахування — income.',
  '',
  String(ocrText ?? '').trim(),
].join('\n');

const mapOcrFailure = (result) => {
  if (result?.status === 'misconfigured') return { status: 'not_configured' };
  if (result?.status === 'rate_limited') return { status: 'rate_limited' };
  if (result?.status === 'no_text') return { status: 'not_recognized' };
  return { status: 'provider_error' };
};

/**
 * Download a Telegram image, OCR it and pass the text through the existing
 * transaction parser. The image buffer is never written to disk.
 */
export async function parseTelegramTransactionImage({
  bot,
  image,
  categories,
  accounts = [],
  defaultCurrency = 'UAH',
  today,
  fetchImpl = fetch,
  scanText = scanReceiptTextWithOcrSpace,
  parseTransaction = parseSmartTransaction,
  maxBytes = TELEGRAM_TRANSACTION_IMAGE_BYTES_LIMIT,
}) {
  if (!bot || !image?.fileId) return { status: 'not_image' };
  if (image.size && image.size > maxBytes) return { status: 'too_large' };

  let response;
  try {
    const fileUrl = await bot.getFileLink(image.fileId);
    response = await fetchImpl(fileUrl, { signal: AbortSignal.timeout(20_000) });
  } catch {
    return { status: 'download_error' };
  }
  if (!response?.ok) return { status: 'download_error' };

  const declaredSize = finiteSize(response.headers?.get?.('content-length'));
  if (declaredSize && declaredSize > maxBytes) return { status: 'too_large' };

  let buffer;
  try {
    buffer = Buffer.from(await response.arrayBuffer());
  } catch {
    return { status: 'download_error' };
  }
  if (buffer.length === 0) return { status: 'download_error' };
  if (buffer.length > maxBytes) return { status: 'too_large' };

  const ocr = await scanText({
    base64: buffer.toString('base64'),
    mime: image.mime || 'jpeg',
  });
  if (ocr?.status !== 'ok') return mapOcrFailure(ocr);

  const parsed = await parseTransaction({
    text: buildTransactionScreenshotOcrText(ocr.text),
    categories,
    accounts,
    defaultCurrency,
    today,
  });
  if (!parsed?.isTransaction) return { status: 'not_recognized' };
  return { status: 'ok', transaction: parsed };
}
