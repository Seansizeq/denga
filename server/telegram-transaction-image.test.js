import { describe, expect, it, vi } from 'vitest';
import {
  buildTransactionScreenshotOcrText,
  getTelegramTransactionImage,
  parseTelegramTransactionImage,
} from './telegram-transaction-image.js';

const responseWith = (body, contentLength) => ({
  ok: true,
  headers: { get: (name) => (name === 'content-length' && contentLength ? String(contentLength) : null) },
  arrayBuffer: async () => Uint8Array.from(body).buffer,
});

describe('getTelegramTransactionImage', () => {
  it('takes the largest Telegram photo size', () => {
    expect(getTelegramTransactionImage({
      photo: [
        { file_id: 'small', width: 90, height: 160, file_size: 100 },
        { file_id: 'large', width: 1080, height: 1920, file_size: 900 },
      ],
    })).toEqual({ fileId: 'large', mime: 'jpeg', size: 900, source: 'photo' });
  });

  it('accepts supported image documents and ignores other files', () => {
    expect(getTelegramTransactionImage({
      document: { file_id: 'png', mime_type: 'image/png', file_size: 123 },
    })).toEqual({ fileId: 'png', mime: 'png', size: 123, source: 'document' });
    expect(getTelegramTransactionImage({
      document: { file_id: 'pdf', mime_type: 'application/pdf' },
    })).toBeNull();
  });
});

describe('buildTransactionScreenshotOcrText', () => {
  it('tells the parser not to confuse the operation with the balance', () => {
    const text = buildTransactionScreenshotOcrText('-76,61 zł\nБаланс після 3901,14');
    expect(text).toContain('Не використовуй як amount баланс після операції');
    expect(text).toContain('-76,61 zł');
  });
});

describe('parseTelegramTransactionImage', () => {
  const base = {
    bot: { getFileLink: vi.fn(async () => 'https://api.telegram.org/file.jpg') },
    image: { fileId: 'photo-1', mime: 'jpeg', size: 3 },
    categories: [{ id: 'transport', name: 'Транспорт', type: 'expense' }],
    accounts: [],
    defaultCurrency: 'UAH',
    today: '2026-08-23',
  };

  it('downloads, OCRs and parses a screenshot without writing it to disk', async () => {
    const scanText = vi.fn(async () => ({
      status: 'ok',
      text: 'Пасажирські перевезення\n-76,61 ₴\nБаланс після 3901,14 ₴\n23.08.2026 15:18',
    }));
    const transaction = {
      isTransaction: true,
      amount: 76.61,
      currency: 'UAH',
      date: '2026-08-23',
      categoryId: 'transport',
      categoryName: 'Транспорт',
      type: 'expense',
      note: 'квиток WKD',
    };
    const parseTransaction = vi.fn(async () => transaction);

    const result = await parseTelegramTransactionImage({
      ...base,
      fetchImpl: vi.fn(async () => responseWith([1, 2, 3])),
      scanText,
      parseTransaction,
    });

    expect(result).toEqual({ status: 'ok', transaction });
    expect(scanText).toHaveBeenCalledWith(expect.objectContaining({ mime: 'jpeg', base64: 'AQID' }));
    expect(parseTransaction).toHaveBeenCalledWith(expect.objectContaining({
      defaultCurrency: 'UAH',
      today: '2026-08-23',
      text: expect.stringContaining('Баланс після 3901,14'),
    }));
  });

  it('rejects an oversized file before download', async () => {
    const bot = { getFileLink: vi.fn() };
    const result = await parseTelegramTransactionImage({
      ...base,
      bot,
      image: { ...base.image, size: 11 },
      maxBytes: 10,
    });
    expect(result).toEqual({ status: 'too_large' });
    expect(bot.getFileLink).not.toHaveBeenCalled();
  });

  it('maps OCR and parser failures to user-safe statuses', async () => {
    const fetchImpl = vi.fn(async () => responseWith([1, 2, 3]));
    const noText = await parseTelegramTransactionImage({
      ...base,
      fetchImpl,
      scanText: vi.fn(async () => ({ status: 'no_text' })),
    });
    expect(noText).toEqual({ status: 'not_recognized' });

    const noTransaction = await parseTelegramTransactionImage({
      ...base,
      fetchImpl,
      scanText: vi.fn(async () => ({ status: 'ok', text: 'nothing useful' })),
      parseTransaction: vi.fn(async () => ({ isTransaction: false })),
    });
    expect(noTransaction).toEqual({ status: 'not_recognized' });
  });
});

