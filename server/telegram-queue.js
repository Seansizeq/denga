/**
 * Черга вихідних повідомлень бота.
 *
 * Telegram приймає від бота близько 30 повідомлень на секунду сумарно, і це
 * стеля на весь бот, а не на чат. Розсилка звітів раніше йшла простим циклом:
 * поки людей мало, це працює, а на кількох сотнях перетворюється на потік 429,
 * після яких повідомлення просто губилися — код помилку тільки логував.
 *
 * Тут усі відправлення проходять через один потік із паузою між ними, а 429
 * відсуває наступний слот на стільки, скільки просить Telegram. Стеля спільна,
 * тож і лічильник один на процес.
 *
 * Смуг дві. Відповідь людині, яка щойно написала боту, не має чекати, поки
 * розійдуться п'ять тисяч звітів, тож інтерактивні відправлення завжди
 * забирають слот першими, а розсилка доїдає те, що лишилося.
 */

/** Нижче офіційних ~30/с: стеля рахується на боці Telegram і краще не впиратися в неї. */
export const TELEGRAM_DEFAULT_RATE_PER_SEC = 25;

/** Скільки разів пробуємо одне повідомлення, враховуючи першу спробу. */
const DEFAULT_MAX_ATTEMPTS = 4;

/**
 * Довжина черги, після якої нові відправлення відхиляються. Черга росте лише
 * тоді, коли Telegram повільніший за нас, і без стелі один такт розсилки на
 * велику базу з'їв би пам'ять процесу.
 */
const DEFAULT_MAX_QUEUED = 5000;

/** `retry_after` вказує момент, коли ліміт уже вільний; кілька мс запасу прибирають гонку. */
const RETRY_AFTER_PAD_MS = 250;

const LANES = ['interactive', 'bulk'];

const errorCode = (error) => {
  const code = error?.response?.body?.error_code ?? error?.response?.statusCode;
  const numeric = Number(code);
  return Number.isFinite(numeric) ? numeric : 0;
};

/**
 * Скільки секунд просить почекати Telegram, або `null`, якщо це не 429.
 * node-telegram-bot-api кладе розібране тіло відповіді в `error.response.body`.
 */
export const retryAfterSeconds = (error) => {
  const raw = error?.response?.body?.parameters?.retry_after ?? error?.parameters?.retry_after;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.ceil(seconds));
  return errorCode(error) === 429 ? 1 : null;
};

/**
 * 5xx і обрив зв'язку минають самі, тож їх варто повторити. 4xx — ні: «бот
 * заблокований», «чат не знайдено» і «повідомлення не змінилося» повторами не
 * лікуються, а місце в черзі займають.
 */
export const isTransientError = (error) => {
  const code = errorCode(error);
  if (code >= 500) return true;
  if (code >= 400) return false;
  return true;
};

const backoffMs = (attempt) => Math.min(8000, 500 * 2 ** (attempt - 1));

export const createTelegramQueue = ({
  ratePerSec = TELEGRAM_DEFAULT_RATE_PER_SEC,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  maxQueued = DEFAULT_MAX_QUEUED,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger = console,
} = {}) => {
  const minGapMs = Math.max(1, Math.round(1000 / Math.max(1, ratePerSec)));
  const lanes = new Map(LANES.map((lane) => [lane, []]));
  let nextSlotAt = 0;
  let queued = 0;
  let draining = false;

  const takeNext = () => {
    for (const lane of LANES) {
      const job = lanes.get(lane).shift();
      if (job) return job;
    }
    return null;
  };

  const runJob = async (job) => {
    for (let attempt = 1; ; attempt += 1) {
      const wait = nextSlotAt - now();
      if (wait > 0) await sleep(wait);
      nextSlotAt = Math.max(nextSlotAt, now()) + minGapMs;
      try {
        return await job.task();
      } catch (error) {
        const retryAfter = retryAfterSeconds(error);
        if (retryAfter !== null) {
          // Ліміт спільний на бота, тож пауза стосується і решти черги.
          nextSlotAt = now() + retryAfter * 1000 + RETRY_AFTER_PAD_MS;
          logger.warn?.('[telegram] 429, пауза', { label: job.label, retryAfter, attempt });
          if (attempt >= maxAttempts) throw error;
          continue;
        }
        if (attempt >= maxAttempts || !isTransientError(error)) throw error;
        await sleep(backoffMs(attempt));
      }
    }
  };

  const drain = async () => {
    if (draining) return;
    draining = true;
    try {
      let job = takeNext();
      while (job) {
        queued -= 1;
        try {
          job.resolve(await runJob(job));
        } catch (error) {
          job.reject(error);
        }
        job = takeNext();
      }
    } finally {
      draining = false;
    }
  };

  /**
   * @param {() => Promise<unknown>} task
   * @param {{ lane?: 'interactive' | 'bulk', label?: string }} [options]
   */
  const enqueue = (task, { lane = 'interactive', label = '' } = {}) => {
    const bucket = lanes.get(lane) ?? lanes.get('interactive');
    if (queued >= maxQueued) {
      return Promise.reject(new Error(`telegram queue overflow (${maxQueued}) at ${label || 'send'}`));
    }
    return new Promise((resolve, reject) => {
      bucket.push({ task, label, resolve, reject });
      queued += 1;
      void drain();
    });
  };

  return {
    enqueue,
    size: () => queued,
    sizeOf: (lane) => lanes.get(lane)?.length ?? 0,
  };
};

/**
 * Методи, що впираються в стелю Telegram і терплять затримку.
 *
 * `answerCallbackQuery` сюди не входить свідомо: Telegram чекає на нього кілька
 * секунд, і затримана відповідь — це кнопка, що «висне» у людини на екрані.
 * `sendChatAction` теж ні — індикатор набору, надісланий із запізненням, гірший
 * за ненадісланий.
 */
export const QUEUED_BOT_METHODS = new Set([
  'sendMessage',
  'sendPhoto',
  'sendDocument',
  'editMessageText',
  'editMessageCaption',
  'editMessageReplyMarkup',
]);

/**
 * Обгортка навколо бота: ті самі виклики, але через чергу.
 *
 * Проксі замість правки сорока місць виклику — щоб жоден новий `sendMessage` не
 * лишився повз чергу просто тому, що про неї забули. `bot.bulk` — та сама
 * обгортка, але в смузі розсилки; `bot.direct` — сирий бот, повз чергу.
 */
export const wrapBotWithQueue = (bot, queue) => {
  if (!bot || !queue) return bot;
  const byLane = new Map();

  const laneProxy = (lane) =>
    new Proxy(bot, {
      get(target, prop) {
        if (prop === 'bulk') return proxyFor('bulk');
        if (prop === 'interactive') return proxyFor('interactive');
        if (prop === 'direct') return target;
        // Приймачем свідомо є сам бот, а не проксі: бібліотека кличе власні
        // методи через `this`, і вони мають лишитися на справжньому об'єкті.
        const value = Reflect.get(target, prop, target);
        if (typeof value !== 'function') return value;
        if (!QUEUED_BOT_METHODS.has(prop)) return value.bind(target);
        return (...args) => queue.enqueue(() => value.apply(target, args), { lane, label: String(prop) });
      },
    });

  const proxyFor = (lane) => {
    if (!byLane.has(lane)) byLane.set(lane, laneProxy(lane));
    return byLane.get(lane);
  };

  return proxyFor('interactive');
};
