import { describe, expect, it, vi } from 'vitest';
import {
  QUEUED_BOT_METHODS,
  createTelegramQueue,
  isTransientError,
  retryAfterSeconds,
  wrapBotWithQueue,
} from './telegram-queue.js';

/** Віртуальний час: пауза не чекає, а просто пересуває годинник. */
const createClock = () => {
  let current = 0;
  return {
    now: () => current,
    sleep: async (ms) => {
      current += Math.max(0, ms);
    },
    read: () => current,
  };
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const telegramError = (code, params) => {
  const error = new Error(`ETELEGRAM: ${code}`);
  error.response = { statusCode: code, body: { error_code: code, ...(params ? { parameters: params } : {}) } };
  return error;
};

const silentLogger = { warn: () => {}, error: () => {} };

describe('createTelegramQueue', () => {
  it('spaces sends by the configured rate', async () => {
    const clock = createClock();
    const sentAt = [];
    const queue = createTelegramQueue({ ratePerSec: 25, now: clock.now, sleep: clock.sleep, logger: silentLogger });

    await Promise.all(
      [1, 2, 3].map((n) =>
        queue.enqueue(async () => {
          sentAt.push(clock.read());
          return n;
        }),
      ),
    );

    expect(sentAt).toEqual([0, 40, 80]);
  });

  it('returns the task result to the caller', async () => {
    const clock = createClock();
    const queue = createTelegramQueue({ now: clock.now, sleep: clock.sleep, logger: silentLogger });

    await expect(queue.enqueue(async () => 'message_id')).resolves.toBe('message_id');
  });

  /**
   * Заради цього смуги й існують: відповідь людині, яка щойно написала боту, не
   * має чекати кінця розсилки на всю базу.
   */
  it('lets an interactive send overtake a queued broadcast', async () => {
    const clock = createClock();
    const queue = createTelegramQueue({ now: clock.now, sleep: clock.sleep, logger: silentLogger });
    const order = [];
    const first = deferred();

    const running = queue.enqueue(() => first.promise, { lane: 'bulk' });
    const later = Promise.all([
      queue.enqueue(async () => order.push('bulk'), { lane: 'bulk' }),
      queue.enqueue(async () => order.push('interactive'), { lane: 'interactive' }),
    ]);

    first.resolve('ok');
    await running;
    await later;

    expect(order).toEqual(['interactive', 'bulk']);
  });

  it('waits out a 429 and delivers the message', async () => {
    const clock = createClock();
    const queue = createTelegramQueue({ ratePerSec: 25, now: clock.now, sleep: clock.sleep, logger: silentLogger });
    const task = vi
      .fn()
      .mockRejectedValueOnce(telegramError(429, { retry_after: 3 }))
      .mockResolvedValueOnce('delivered');

    await expect(queue.enqueue(task)).resolves.toBe('delivered');
    expect(task).toHaveBeenCalledTimes(2);
    expect(clock.read()).toBeGreaterThanOrEqual(3000);
  });

  /** Пауза після 429 стосується всього бота, тож і наступних у черзі теж. */
  it('holds the whole queue back after a 429', async () => {
    const clock = createClock();
    const queue = createTelegramQueue({ ratePerSec: 25, now: clock.now, sleep: clock.sleep, logger: silentLogger });
    let secondSentAt = -1;

    const first = queue.enqueue(
      vi.fn().mockRejectedValueOnce(telegramError(429, { retry_after: 5 })).mockResolvedValueOnce('ok'),
    );
    const second = queue.enqueue(async () => {
      secondSentAt = clock.read();
    });

    await Promise.all([first, second]);

    expect(secondSentAt).toBeGreaterThanOrEqual(5000);
  });

  it('gives up after the last attempt on a 429', async () => {
    const clock = createClock();
    const queue = createTelegramQueue({
      maxAttempts: 2,
      now: clock.now,
      sleep: clock.sleep,
      logger: silentLogger,
    });
    const task = vi.fn().mockRejectedValue(telegramError(429, { retry_after: 1 }));

    await expect(queue.enqueue(task)).rejects.toThrow(/ETELEGRAM/);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('retries a server error', async () => {
    const clock = createClock();
    const queue = createTelegramQueue({ now: clock.now, sleep: clock.sleep, logger: silentLogger });
    const task = vi.fn().mockRejectedValueOnce(telegramError(502)).mockResolvedValueOnce('ok');

    await expect(queue.enqueue(task)).resolves.toBe('ok');
    expect(task).toHaveBeenCalledTimes(2);
  });

  /** «Бот заблокований» повторами не лікується, а слот у черзі забирає. */
  it('does not retry a rejection the bot cannot fix', async () => {
    const clock = createClock();
    const queue = createTelegramQueue({ now: clock.now, sleep: clock.sleep, logger: silentLogger });
    const task = vi.fn().mockRejectedValue(telegramError(403));

    await expect(queue.enqueue(task)).rejects.toThrow(/ETELEGRAM/);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('refuses new sends once the queue is full instead of growing without bound', async () => {
    const clock = createClock();
    const queue = createTelegramQueue({ maxQueued: 2, now: clock.now, sleep: clock.sleep, logger: silentLogger });
    const blocker = deferred();

    const running = queue.enqueue(() => blocker.promise);
    const waiting = [queue.enqueue(async () => 'second'), queue.enqueue(async () => 'third')];
    const rejected = queue.enqueue(async () => 'fourth');

    await expect(rejected).rejects.toThrow(/overflow/);
    blocker.resolve('first');
    await Promise.all([running, ...waiting]);
  });

  it('reports what is still waiting', async () => {
    const clock = createClock();
    const queue = createTelegramQueue({ now: clock.now, sleep: clock.sleep, logger: silentLogger });
    const blocker = deferred();

    const running = queue.enqueue(() => blocker.promise);
    const pending = queue.enqueue(async () => 'later', { lane: 'bulk' });

    expect(queue.size()).toBe(1);
    expect(queue.sizeOf('bulk')).toBe(1);

    blocker.resolve('ok');
    await Promise.all([running, pending]);
    expect(queue.size()).toBe(0);
  });
});

describe('retryAfterSeconds', () => {
  it('reads the wait Telegram asks for', () => {
    expect(retryAfterSeconds(telegramError(429, { retry_after: 12 }))).toBe(12);
  });

  it('falls back to a second when 429 arrives without a wait', () => {
    expect(retryAfterSeconds(telegramError(429))).toBe(1);
  });

  it('is null for anything that is not a rate limit', () => {
    expect(retryAfterSeconds(telegramError(400))).toBeNull();
    expect(retryAfterSeconds(new Error('socket hang up'))).toBeNull();
  });
});

describe('isTransientError', () => {
  it('retries network failures and server errors', () => {
    expect(isTransientError(new Error('socket hang up'))).toBe(true);
    expect(isTransientError(telegramError(500))).toBe(true);
  });

  it('does not retry a rejected request', () => {
    expect(isTransientError(telegramError(400))).toBe(false);
    expect(isTransientError(telegramError(403))).toBe(false);
  });
});

describe('wrapBotWithQueue', () => {
  const fakeBot = () => ({
    sent: [],
    listeners: [],
    sendMessage(chatId, text) {
      this.sent.push({ chatId, text });
      return Promise.resolve({ message_id: this.sent.length });
    },
    answerCallbackQuery(id) {
      this.sent.push({ answered: id });
      return Promise.resolve(true);
    },
    on(event, handler) {
      this.listeners.push({ event, handler });
    },
    isPolling: true,
  });

  it('routes a send through the queue', async () => {
    const clock = createClock();
    const queue = createTelegramQueue({ ratePerSec: 25, now: clock.now, sleep: clock.sleep, logger: silentLogger });
    const raw = fakeBot();
    const bot = wrapBotWithQueue(raw, queue);

    await Promise.all([bot.sendMessage(1, 'a'), bot.sendMessage(2, 'b')]);

    expect(raw.sent).toEqual([
      { chatId: 1, text: 'a' },
      { chatId: 2, text: 'b' },
    ]);
    expect(clock.read()).toBe(40);
  });

  /** Кнопка «висне» в інтерфейсі, поки на callback немає відповіді, — тут черга шкодить. */
  it('answers a callback query without waiting for the queue', async () => {
    const clock = createClock();
    const queue = createTelegramQueue({ now: clock.now, sleep: clock.sleep, logger: silentLogger });
    const raw = fakeBot();
    const bot = wrapBotWithQueue(raw, queue);
    const blocker = deferred();

    const held = queue.enqueue(() => blocker.promise, { lane: 'bulk' });
    await bot.answerCallbackQuery('cb-1');

    expect(raw.sent).toEqual([{ answered: 'cb-1' }]);
    blocker.resolve('ok');
    await held;
  });

  it('keeps non-sending methods and plain properties working', () => {
    const clock = createClock();
    const queue = createTelegramQueue({ now: clock.now, sleep: clock.sleep, logger: silentLogger });
    const raw = fakeBot();
    const bot = wrapBotWithQueue(raw, queue);

    bot.on('message', () => {});

    expect(raw.listeners).toHaveLength(1);
    expect(bot.isPolling).toBe(true);
    expect(bot.direct).toBe(raw);
  });

  it('sends through the broadcast lane via bot.bulk', async () => {
    const clock = createClock();
    const queue = createTelegramQueue({ now: clock.now, sleep: clock.sleep, logger: silentLogger });
    const raw = fakeBot();
    const bot = wrapBotWithQueue(raw, queue);
    const blocker = deferred();
    const order = [];

    const held = queue.enqueue(() => blocker.promise);
    const bulk = bot.bulk.sendMessage(1, 'report').then(() => order.push('bulk'));
    const interactive = bot.sendMessage(2, 'reply').then(() => order.push('interactive'));

    blocker.resolve('ok');
    await Promise.all([held, bulk, interactive]);

    expect(order).toEqual(['interactive', 'bulk']);
  });

  it('leaves the bot untouched when there is no queue', () => {
    const raw = fakeBot();
    expect(wrapBotWithQueue(raw, null)).toBe(raw);
    expect(wrapBotWithQueue(null, {})).toBeNull();
  });

  it('queues exactly the methods that hit the Telegram rate limit', () => {
    expect([...QUEUED_BOT_METHODS]).toContain('sendPhoto');
    expect([...QUEUED_BOT_METHODS]).not.toContain('answerCallbackQuery');
    expect([...QUEUED_BOT_METHODS]).not.toContain('sendChatAction');
  });
});
