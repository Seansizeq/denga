/**
 * Черга вихідних повідомлень, що переживає перезапуск.
 *
 * `telegram-queue.js` розвʼязує іншу задачу — не перевищити стелю Telegram у
 * ~30 повідомлень на секунду. Вона живе в памʼяті процесу, і цього досить, поки
 * відправник і застосунок — це одне й те саме. Але:
 *
 * 1. Повідомлення губилися при рестарті. Алерт «бюджет вичерпано», що стояв у
 *    черзі під час деплою, просто зникав — і ніхто про це не дізнавався.
 * 2. Після поділу на процеси (API окремо, бот окремо) API взагалі не матиме
 *    бота під рукою: `polling` має бути рівно в одному процесі, інакше
 *    Telegram віддає апдейти навперемін і половина губиться.
 *
 * Тому API не шле повідомлення, а **записує рядок у базу**. Бот-процес читає
 * цю таблицю й відправляє. База тут не «черга задач узагалі», а найдешевший
 * спосіб передати кілька повідомлень на хвилину між двома процесами, які й так
 * мають спільний файл.
 */
import { isTransientError, retryAfterSeconds } from './telegram-queue.js';

/** Скільки разів пробуємо, перш ніж визнати повідомлення недоставленим. */
export const OUTBOX_MAX_ATTEMPTS = 6;

/** Скільки рядків беремо за один такт. Стеля Telegram усе одно нижча. */
export const OUTBOX_BATCH = 50;

/**
 * Пауза перед наступною спробою: 10 с, 20, 40… але не довше півгодини.
 * Верхня межа є, бо без неї шоста спроба чекала б понад добу — а повідомлення
 * про перевищений бюджет за добу вже нікому не потрібне.
 */
export const outboxBackoffMs = (attempts) => Math.min(30 * 60_000, 10_000 * 2 ** Math.max(0, attempts - 1));

/**
 * Знімок лежить у черзі рядком base64, а не буфером.
 *
 * Payload проходить через `JSON.stringify`, а буфер після нього стає
 * `{ type: 'Buffer', data: [...] }` — назад він сам не збереться, і Telegram
 * такого не приймає. Тому байти зберігаються текстом, а буфер збирається за
 * мить до відправки.
 */
const photoSource = (payload) =>
  typeof payload?.fileBase64 === 'string' ? Buffer.from(payload.fileBase64, 'base64') : payload?.file;

const SENDERS = {
  message: (bot, chatId, payload) => bot.sendMessage(chatId, payload.text, payload.options ?? {}),
  // Четвертий аргумент — ім'я файлу й тип: без них бібліотека не знає, чим є
  // буфер, і відмовляє замість того, щоб надіслати.
  photo: (bot, chatId, payload) =>
    bot.sendPhoto(chatId, photoSource(payload), payload.options ?? {}, payload.fileOptions ?? {}),
  document: (bot, chatId, payload) =>
    bot.sendDocument(chatId, photoSource(payload), payload.options ?? {}, payload.fileOptions ?? {}),
};

export const OUTBOX_KINDS = Object.keys(SENDERS);

const isoAfter = (nowMs, deltaMs) => new Date(nowMs + deltaMs).toISOString();

/**
 * Поставити повідомлення в чергу.
 *
 * Викликається зі шляхів API. Це звичайний `INSERT`, тож його можна робити
 * всередині транзакції разом із даними, яких повідомлення стосується — і тоді
 * «гроші записані, але алерт не поїхав» стає неможливим станом.
 *
 * @param {object} db
 * @param {{ chatId: number, kind?: string, text?: string, file?: unknown,
 *           fileBase64?: string, fileOptions?: object, options?: object,
 *           lane?: 'interactive' | 'bulk', id?: string, nowMs?: number }} message
 */
export const enqueueOutbox = async (db, message) => {
  const chatId = Number(message?.chatId);
  if (!Number.isFinite(chatId) || chatId === 0) {
    throw new Error('enqueueOutbox: потрібен chatId');
  }
  const kind = String(message?.kind ?? 'message');
  if (!Object.prototype.hasOwnProperty.call(SENDERS, kind)) {
    throw new Error(`enqueueOutbox: невідомий тип "${kind}"`);
  }
  const nowMs = message?.nowMs ?? Date.now();
  const id = message?.id ?? `${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const payload = JSON.stringify({
    text: message?.text,
    file: message?.file,
    fileBase64: message?.fileBase64,
    fileOptions: message?.fileOptions,
    options: message?.options,
  });

  await db.run(
    `INSERT INTO telegram_outbox (id, chat_id, kind, payload, lane, attempts, next_attempt_at, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, chatId, kind, payload, message?.lane === 'interactive' ? 'interactive' : 'bulk',
     new Date(nowMs).toISOString(), new Date(nowMs).toISOString()],
  );
  return id;
};

/** Рядки, чий час настав. */
export const claimDueOutbox = async (db, { limit = OUTBOX_BATCH, nowMs = Date.now() } = {}) =>
  db.all(
    `SELECT id, chat_id AS chatId, kind, payload, lane, attempts
     FROM telegram_outbox
     WHERE next_attempt_at <= ?
     ORDER BY next_attempt_at ASC
     LIMIT ?`,
    [new Date(nowMs).toISOString(), limit],
  );

/**
 * Відправити те, що дозріло.
 *
 * Не реентерабельна: викликач має стежити, щоб два такти не йшли одночасно
 * (див. прапорці в `index.js`). Повертає підсумок — його зручно віддавати в
 * метрики.
 *
 * @returns {Promise<{ sent: number, retried: number, dropped: number }>}
 */
export const drainOutbox = async (db, bot, { limit = OUTBOX_BATCH, nowMs = Date.now(), logger = console } = {}) => {
  const stats = { sent: 0, retried: 0, dropped: 0 };
  if (!bot) return stats;

  const rows = await claimDueOutbox(db, { limit, nowMs });
  for (const row of rows ?? []) {
    let payload;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      // Нечитабельний рядок повторювати немає сенсу — він таким і лишиться.
      await db.run('DELETE FROM telegram_outbox WHERE id = ?', [row.id]);
      stats.dropped += 1;
      logger.error?.('[outbox] зіпсований payload, рядок прибрано', { id: row.id });
      continue;
    }

    const send = SENDERS[row.kind];
    const lane = row.lane === 'interactive' ? bot.interactive ?? bot : bot.bulk ?? bot;

    try {
      await send(lane, Number(row.chatId), payload);
      await db.run('DELETE FROM telegram_outbox WHERE id = ?', [row.id]);
      stats.sent += 1;
    } catch (error) {
      const attempts = Number(row.attempts) + 1;
      const retryAfter = retryAfterSeconds(error);
      const permanent = retryAfter === null && !isTransientError(error);

      // «Бот заблокований», «чат не знайдено» — повторами не лікуються, а
      // місце в черзі займають і затримують решту.
      if (permanent || attempts >= OUTBOX_MAX_ATTEMPTS) {
        await db.run('DELETE FROM telegram_outbox WHERE id = ?', [row.id]);
        stats.dropped += 1;
        logger.error?.('[outbox] повідомлення не доставлено', {
          id: row.id,
          chatId: row.chatId,
          attempts,
          permanent,
          error: String(error?.message ?? error).slice(0, 200),
        });
        continue;
      }

      const waitMs = retryAfter !== null ? retryAfter * 1000 : outboxBackoffMs(attempts);
      await db.run(
        'UPDATE telegram_outbox SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?',
        [attempts, isoAfter(nowMs, waitMs), String(error?.message ?? error).slice(0, 200), row.id],
      );
      stats.retried += 1;
    }
  }
  return stats;
};

/** Скільки повідомлень чекає. Для `/metrics` і для тестів. */
export const outboxDepth = async (db) => {
  const row = await db.get('SELECT COUNT(*) AS n FROM telegram_outbox');
  return Number(row?.n) || 0;
};
