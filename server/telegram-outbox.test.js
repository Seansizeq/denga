import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  OUTBOX_MAX_ATTEMPTS,
  claimDueOutbox,
  drainOutbox,
  enqueueOutbox,
  outboxBackoffMs,
  outboxDepth,
} from './telegram-outbox.js';

let db;
const NOW = Date.parse('2026-09-06T12:00:00.000Z');

beforeEach(async () => {
  db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE telegram_outbox (
      id TEXT PRIMARY KEY,
      chat_id INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'message',
      payload TEXT NOT NULL,
      lane TEXT NOT NULL DEFAULT 'bulk',
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL
    )`);
});

afterEach(async () => {
  await db.close();
});

/** Бот, що рахує відправлення й може падати заданою помилкою. */
const makeBot = (behaviour = () => undefined) => {
  const sent = [];
  const bot = {
    sent,
    lanes: [],
    async sendMessage(chatId, text, options) {
      const outcome = behaviour(sent.length);
      if (outcome instanceof Error) throw outcome;
      sent.push({ chatId, text, options });
      return { message_id: sent.length };
    },
    async sendPhoto(chatId, file, options, fileOptions) {
      const outcome = behaviour(sent.length);
      if (outcome instanceof Error) throw outcome;
      sent.push({ chatId, file, options, fileOptions });
      return { message_id: sent.length };
    },
  };
  // Смуги, як у справжньої обгортки навколо бота.
  bot.bulk = { ...bot, sendMessage: (...a) => { bot.lanes.push('bulk'); return bot.sendMessage(...a); } };
  bot.interactive = { ...bot, sendMessage: (...a) => { bot.lanes.push('interactive'); return bot.sendMessage(...a); } };
  return bot;
};

const telegramError = (code, extra = {}) =>
  Object.assign(new Error(`telegram ${code}`), { response: { body: { error_code: code, ...extra } } });

describe('enqueueOutbox', () => {
  it('кладе повідомлення так, що воно готове до відправки одразу', async () => {
    await enqueueOutbox(db, { chatId: 42, text: 'привіт', nowMs: NOW });
    const due = await claimDueOutbox(db, { nowMs: NOW });
    expect(due).toHaveLength(1);
    expect(due[0].chatId).toBe(42);
    expect(JSON.parse(due[0].payload).text).toBe('привіт');
  });

  it('відмовляється від повідомлення без адресата', async () => {
    await expect(enqueueOutbox(db, { text: 'нікому' })).rejects.toThrow(/потрібен chatId/);
  });

  it('відмовляється від невідомого типу — краще впасти тут, ніж у такті', async () => {
    await expect(enqueueOutbox(db, { chatId: 1, kind: 'telepathy' })).rejects.toThrow(/невідомий тип/);
  });
});

describe('drainOutbox', () => {
  it('відправляє й прибирає рядок', async () => {
    await enqueueOutbox(db, { chatId: 42, text: 'бюджет вичерпано', nowMs: NOW });
    const bot = makeBot();

    const stats = await drainOutbox(db, bot, { nowMs: NOW });

    expect(stats).toEqual({ sent: 1, retried: 0, dropped: 0 });
    expect(bot.sent[0]).toMatchObject({ chatId: 42, text: 'бюджет вичерпано' });
    expect(await outboxDepth(db)).toBe(0);
  });

  it('збирає знімок назад у буфер: через JSON буфер не проходить', async () => {
    const png = Buffer.from('якийсь знімок екрана, довший за поріг у 64 байти — інакше він не пройде перевірку');
    await enqueueOutbox(db, {
      chatId: 42,
      kind: 'photo',
      fileBase64: png.toString('base64'),
      fileOptions: { filename: 'feedback.jpg', contentType: 'image/jpeg' },
      options: { caption: 'знімок до скарги' },
      nowMs: NOW,
    });
    const bot = makeBot();

    const stats = await drainOutbox(db, bot, { nowMs: NOW });

    expect(stats).toEqual({ sent: 1, retried: 0, dropped: 0 });
    expect(Buffer.isBuffer(bot.sent[0].file)).toBe(true);
    expect(bot.sent[0].file.equals(png)).toBe(true);
    expect(bot.sent[0].fileOptions).toEqual({ filename: 'feedback.jpg', contentType: 'image/jpeg' });
    expect(bot.sent[0].options).toEqual({ caption: 'знімок до скарги' });
  });

  it('за замовчуванням шле смугою розсилки, щоб не тіснити відповіді людям', async () => {
    await enqueueOutbox(db, { chatId: 1, text: 'а', nowMs: NOW });
    await enqueueOutbox(db, { chatId: 2, text: 'б', lane: 'interactive', nowMs: NOW });
    const bot = makeBot();

    await drainOutbox(db, bot, { nowMs: NOW });

    expect(bot.lanes).toEqual(['bulk', 'interactive']);
  });

  it('не чіпає рядки, чий час ще не настав', async () => {
    await enqueueOutbox(db, { chatId: 1, text: 'пізніше', nowMs: NOW + 60_000 });
    const bot = makeBot();

    const stats = await drainOutbox(db, bot, { nowMs: NOW });

    expect(stats.sent).toBe(0);
    expect(await outboxDepth(db)).toBe(1);
  });

  it('відкладає тимчасову помилку й лишає повідомлення в черзі', async () => {
    await enqueueOutbox(db, { chatId: 1, text: 'а', nowMs: NOW });
    const bot = makeBot(() => telegramError(502));

    const stats = await drainOutbox(db, bot, { nowMs: NOW });

    expect(stats).toEqual({ sent: 0, retried: 1, dropped: 0 });
    const row = await db.get('SELECT attempts, next_attempt_at, last_error FROM telegram_outbox');
    expect(row.attempts).toBe(1);
    expect(Date.parse(row.next_attempt_at)).toBe(NOW + outboxBackoffMs(1));
    expect(row.last_error).toContain('502');
  });

  it('слухається retry_after від Telegram замість власної паузи', async () => {
    await enqueueOutbox(db, { chatId: 1, text: 'а', nowMs: NOW });
    const bot = makeBot(() => telegramError(429, { parameters: { retry_after: 17 } }));

    await drainOutbox(db, bot, { nowMs: NOW });

    const row = await db.get('SELECT next_attempt_at FROM telegram_outbox');
    expect(Date.parse(row.next_attempt_at)).toBe(NOW + 17_000);
  });

  it('не повторює те, що повторами не лікується', async () => {
    await enqueueOutbox(db, { chatId: 1, text: 'а', nowMs: NOW });
    // 403 — «бот заблокований користувачем». Скільки не шли, результат той самий.
    const bot = makeBot(() => telegramError(403));

    const stats = await drainOutbox(db, bot, { nowMs: NOW });

    expect(stats).toEqual({ sent: 0, retried: 0, dropped: 1 });
    expect(await outboxDepth(db)).toBe(0);
  });

  it('здається після межі спроб і не тримає чергу вічно', async () => {
    await enqueueOutbox(db, { chatId: 1, text: 'а', nowMs: NOW });
    const bot = makeBot(() => telegramError(500));

    let at = NOW;
    for (let i = 0; i < OUTBOX_MAX_ATTEMPTS; i += 1) {
      await drainOutbox(db, bot, { nowMs: at });
      at += 60 * 60_000; // з великим запасом на будь-яку паузу
    }

    expect(await outboxDepth(db)).toBe(0);
  });

  it('одне зіпсоване повідомлення не блокує решту', async () => {
    await enqueueOutbox(db, { chatId: 1, text: 'а', nowMs: NOW });
    await db.run('UPDATE telegram_outbox SET payload = ? WHERE chat_id = 1', ['не-json']);
    await enqueueOutbox(db, { chatId: 2, text: 'б', nowMs: NOW });
    const bot = makeBot();

    const stats = await drainOutbox(db, bot, { nowMs: NOW, logger: { error: () => {} } });

    expect(stats).toEqual({ sent: 1, retried: 0, dropped: 1 });
    expect(bot.sent[0].chatId).toBe(2);
    expect(await outboxDepth(db)).toBe(0);
  });

  it('без бота нічого не втрачає — повідомлення дочекаються', async () => {
    await enqueueOutbox(db, { chatId: 1, text: 'а', nowMs: NOW });

    const stats = await drainOutbox(db, null, { nowMs: NOW });

    expect(stats).toEqual({ sent: 0, retried: 0, dropped: 0 });
    expect(await outboxDepth(db)).toBe(1);
  });
});

describe('outboxBackoffMs', () => {
  it('росте, але має стелю — доба очікування нікому не потрібна', () => {
    expect(outboxBackoffMs(1)).toBe(10_000);
    expect(outboxBackoffMs(2)).toBe(20_000);
    expect(outboxBackoffMs(3)).toBe(40_000);
    expect(outboxBackoffMs(20)).toBe(30 * 60_000);
  });
});
