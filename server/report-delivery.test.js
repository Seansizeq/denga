import { describe, expect, it, vi } from 'vitest';
import { deliverReportToTelegram } from './report-delivery.js';

const silentLogger = { warn: vi.fn(), error: vi.fn() };

describe('report delivery', () => {
  it('sends the image and detailed text', async () => {
    const bot = { sendPhoto: vi.fn(async () => ({})), sendMessage: vi.fn(async () => ({})) };
    await expect(deliverReportToTelegram({
      bot,
      chatId: 1,
      pngBuffer: Buffer.from('png'),
      caption: 'Weekly report',
      text: 'Details',
      logger: silentLogger,
    })).resolves.toBe(true);
    expect(bot.sendPhoto).toHaveBeenCalledOnce();
    expect(bot.sendMessage).toHaveBeenCalledOnce();
  });

  it('falls back to text when photo delivery fails', async () => {
    const bot = {
      sendPhoto: vi.fn(async () => { throw new Error('photo failed'); }),
      sendMessage: vi.fn(async () => ({})),
    };
    await expect(deliverReportToTelegram({
      bot,
      chatId: 1,
      pngBuffer: Buffer.from('png'),
      caption: 'Weekly report',
      text: 'Details',
      logger: silentLogger,
    })).resolves.toBe(true);
    expect(bot.sendMessage).toHaveBeenCalledOnce();
  });

  it('reports failure only when neither delivery succeeds', async () => {
    const bot = {
      sendPhoto: vi.fn(async () => { throw new Error('photo failed'); }),
      sendMessage: vi.fn(async () => { throw new Error('text failed'); }),
    };
    await expect(deliverReportToTelegram({
      bot,
      chatId: 1,
      pngBuffer: Buffer.from('png'),
      caption: 'Weekly report',
      text: 'Details',
      logger: silentLogger,
    })).resolves.toBe(false);
  });
});
