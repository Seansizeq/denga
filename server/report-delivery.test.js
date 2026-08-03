import { describe, expect, it, vi } from 'vitest';
import { deliverReportToTelegram } from './report-delivery.js';

const silentLogger = { warn: vi.fn(), error: vi.fn() };

describe('report delivery', () => {
  it('sends only the image when rendering succeeds', async () => {
    const bot = { sendPhoto: vi.fn(async () => ({})), sendMessage: vi.fn(async () => ({})) };
    await expect(deliverReportToTelegram({
      bot,
      chatId: 1,
      pngBuffer: Buffer.from('png'),
      fallbackText: 'Short fallback',
      logger: silentLogger,
    })).resolves.toBe(true);
    expect(bot.sendPhoto).toHaveBeenCalledOnce();
    expect(bot.sendPhoto.mock.calls[0][2]).toEqual({});
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('sends one short text fallback when photo delivery fails', async () => {
    const bot = {
      sendPhoto: vi.fn(async () => { throw new Error('photo failed'); }),
      sendMessage: vi.fn(async () => ({})),
    };
    await expect(deliverReportToTelegram({
      bot,
      chatId: 1,
      pngBuffer: Buffer.from('png'),
      fallbackText: 'Short fallback',
      logger: silentLogger,
    })).resolves.toBe(true);
    expect(bot.sendPhoto).toHaveBeenCalledOnce();
    expect(bot.sendMessage).toHaveBeenCalledOnce();
    expect(bot.sendMessage).toHaveBeenCalledWith(1, 'Short fallback', { disable_web_page_preview: true });
  });

  it('reports failure when the single available delivery also fails', async () => {
    const bot = {
      sendPhoto: vi.fn(async () => { throw new Error('photo failed'); }),
      sendMessage: vi.fn(async () => { throw new Error('text failed'); }),
    };
    await expect(deliverReportToTelegram({
      bot,
      chatId: 1,
      pngBuffer: Buffer.from('png'),
      fallbackText: 'Short fallback',
      logger: silentLogger,
    })).resolves.toBe(false);
  });
});
