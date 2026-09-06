/**
 * Стан процесу: чи живий і що з ним відбувається.
 *
 * Досі дізнатися це було нізвідки. Чи переповнена черга Telegram, чи відвалився
 * пул рендеру, чи впирається база в `SQLITE_BUSY`, скільки людей отримують 429
 * — усе це або мовчить, або тоне в логах. На тисячі користувачів так не можна:
 * перше, про що дізнаєшся, стане скаргою в чаті.
 *
 * Два різні призначення й два різні рівні доступу:
 *
 *   `/healthz` — «чи варто слати сюди трафік». Відкритий, дешевий, придатний
 *                для перевірки nginx кілька разів на секунду.
 *   `/metrics` — числа для людини. За токеном, бо розкривають розмір бази,
 *                кількість людей і внутрішній устрій.
 */
import crypto from 'crypto';

/** Скільки тримаємо відповідь `/healthz` без повторної перевірки бази. */
const HEALTH_CACHE_MS = 2000;

/**
 * Порівняння токена за сталий час — з тієї ж причини, що й у перевірці
 * `initData`: різниця в першому байті не має вимірюватися швидше за різницю в
 * останньому.
 */
const tokenMatches = (expected, received) => {
  const a = Buffer.from(String(expected ?? ''), 'utf8');
  const b = Buffer.from(String(received ?? ''), 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

/**
 * Лічильники запитів.
 *
 * Затримки складаються у відра, а не в список: список ріс би без межі, а
 * приблизного розподілу для «чи стало гірше» цілком досить. Шляхи не
 * розрізняються — інакше кожен `/api/goals/<uuid>` створював би власний
 * лічильник, і метрики стали б витоком памʼяті.
 */
export const LATENCY_BUCKETS_MS = [10, 50, 100, 250, 500, 1000, 2500];

export const createRequestMetrics = ({ now = () => Date.now() } = {}) => {
  const counts = { total: 0, ok: 0, clientError: 0, serverError: 0, unauthorized: 0, rateLimited: 0, notModified: 0 };
  const buckets = new Array(LATENCY_BUCKETS_MS.length + 1).fill(0);
  let slowest = null;

  const record = (status, ms, method, path) => {
    counts.total += 1;
    if (status === 304) counts.notModified += 1;
    else if (status < 400) counts.ok += 1;
    else if (status < 500) counts.clientError += 1;
    else counts.serverError += 1;
    if (status === 401) counts.unauthorized += 1;
    if (status === 429) counts.rateLimited += 1;

    let index = LATENCY_BUCKETS_MS.findIndex((edge) => ms < edge);
    if (index === -1) index = LATENCY_BUCKETS_MS.length;
    buckets[index] += 1;

    if (!slowest || ms > slowest.ms) slowest = { ms: Math.round(ms), method, path };
  };

  const middleware = (req, res, next) => {
    const startedAt = now();
    res.on('finish', () => record(res.statusCode, now() - startedAt, req.method, req.path));
    next();
  };

  const snapshot = () => ({
    ...counts,
    latencyMs: Object.fromEntries(
      buckets.map((count, i) => [
        i < LATENCY_BUCKETS_MS.length ? `<${LATENCY_BUCKETS_MS[i]}` : `>=${LATENCY_BUCKETS_MS.at(-1)}`,
        count,
      ]),
    ),
    slowest,
  });

  return { middleware, snapshot, record };
};

/**
 * Обробники стану.
 *
 * @param {object} params
 * @param {object} params.db
 * @param {string} params.role роль процесу (`api` | `bot` | `all`)
 * @param {() => object} [params.collect] числа, специфічні для ролі
 * @param {() => number} [params.now]
 */
export const createHealthHandlers = ({ db, role, collect = () => ({}), now = () => Date.now() }) => {
  let cached = null;

  /**
   * Перевірка живості — саме `SELECT 1`, а не `PRAGMA quick_check`.
   *
   * План передбачав перевірку цілісності раз на хвилину, але quick_check читає
   * **кожну сторінку** бази: на базі в гігабайт це секунди роботи, і ставити
   * таке на шлях, який nginx смикає постійно, означало б зробити перевірку
   * стану найдорожчим запитом у системі. Цілісність уже перевіряється щодня в
   * бекапі (`verifyBackupFile`) — з алертом у Telegram, якщо не так.
   */
  const healthz = async (_req, res) => {
    if (cached && now() - cached.at < HEALTH_CACHE_MS) {
      res.status(cached.body.ok ? 200 : 503).json(cached.body);
      return;
    }
    let body;
    try {
      await db.get('SELECT 1');
      body = { ok: true, role, uptimeSec: Math.round(process.uptime()) };
    } catch (error) {
      body = { ok: false, role, error: String(error?.message ?? error).slice(0, 200) };
    }
    cached = { at: now(), body };
    res.status(body.ok ? 200 : 503).json(body);
  };

  /**
   * Метрики за токеном. Без заданого `METRICS_TOKEN` шлях відповідає 404, а не
   * 403: неіснуючий маршрут не повідомляє, що тут є що вмикати.
   */
  const metrics = async (req, res) => {
    const expected = process.env.METRICS_TOKEN;
    if (!expected) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const provided = String(req.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
      || String(req.query?.token ?? '');
    if (!tokenMatches(expected, provided)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const memory = process.memoryUsage();
    res.json({
      role,
      uptimeSec: Math.round(process.uptime()),
      pid: process.pid,
      memoryMb: {
        rss: Math.round(memory.rss / 1024 / 1024),
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      },
      ...(await collect()),
    });
  };

  return { healthz, metrics };
};
