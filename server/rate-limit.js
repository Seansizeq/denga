/**
 * Обмеження частоти запитів.
 *
 * Лічильники живуть у пам'яті процесу: застосунок працює одним pm2-процесом на
 * одному сервері, тож зовнішнє сховище тут нічого не додало б, окрім залежності.
 * Якщо колись з'явиться другий інстанс — ліміт стане вдвічі м'якшим, але не
 * зламається, і це найгірше, що станеться.
 *
 * Ключ навмисно не завжди IP. За nginx усі запити приходять з 127.0.0.1, і
 * ліміт по IP став би одним спільним відром на всіх користувачів: один клієнт
 * глушив би решту. Тому кожен лімітер сам каже, чим себе рахувати — id
 * користувача, токеном автоматизації, і лише в останню чергу адресою.
 */

/** Скільки живе запис без звернень, перш ніж прибиральник його викине. */
const SWEEP_IDLE_FACTOR = 2;

/**
 * Вікно фіксоване, а не ковзне: на межі двох вікон теоретично проходить до 2×max,
 * але зберігати історію кожного запиту заради цієї точності немає сенсу — ліміт
 * тут захищає від флуду, а не рахує квоту.
 *
 * @param {object} opts
 * @param {number} opts.windowMs довжина вікна
 * @param {number} opts.max скільки запитів дозволено у вікні
 * @param {(req: object) => string | null} opts.keyFn чим рахувати клієнта; `null` — не рахувати зовсім
 * @param {() => number} [opts.nowFn]
 * @returns {{ check: (req: object) => { allowed: boolean, retryAfterSec: number }, size: () => number }}
 */
export const createRateLimiter = ({ windowMs, max, keyFn, nowFn = () => Date.now() }) => {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error('windowMs must be a positive number');
  if (!Number.isFinite(max) || max <= 0) throw new Error('max must be a positive number');
  if (typeof keyFn !== 'function') throw new Error('keyFn must be a function');

  /** @type {Map<string, { count: number, resetAt: number }>} */
  const buckets = new Map();
  let lastSweepAt = nowFn();

  // Без прибирання Map росла б на кожен новий ключ довічно: підроблені токени
  // в автоматизації дають нескінченний потік унікальних ключів, тобто витік
  // пам'яті, який відкривається тим самим запитом, що й ліміт має спиняти.
  const sweep = (now) => {
    if (now - lastSweepAt < windowMs * SWEEP_IDLE_FACTOR) return;
    lastSweepAt = now;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };

  const check = (req) => {
    const now = nowFn();
    sweep(now);
    const key = keyFn(req);
    if (!key) return { allowed: true, retryAfterSec: 0 };

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSec: 0 };
    }
    bucket.count += 1;
    if (bucket.count <= max) return { allowed: true, retryAfterSec: 0 };
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  };

  return { check, size: () => buckets.size };
};

/**
 * Той самий лічильник у вигляді middleware. Відповідь 429 навмисно без деталей:
 * вона їде і людині в застосунку, і скрипту, що добирає токен, — другому знати
 * про розмір вікна нема потреби, `Retry-After` каже рівно стільки, скільки треба.
 */
export const rateLimitMiddleware = (options) => {
  const limiter = createRateLimiter(options);
  const middleware = (req, res, next) => {
    const { allowed, retryAfterSec } = limiter.check(req);
    if (allowed) {
      next();
      return;
    }
    res.set('Retry-After', String(retryAfterSec));
    res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED', retryAfterSec });
  };
  middleware.limiter = limiter;
  return middleware;
};

/**
 * IP клієнта. `req.ip` довіряє `X-Forwarded-For` лише тоді, коли ввімкнено
 * `trust proxy`, — інакше повертає адресу сокета. Обидва варіанти тут прийнятні:
 * підроблений заголовок без `trust proxy` просто ігнорується.
 */
export const clientIpKey = (req) => String(req.ip ?? req.socket?.remoteAddress ?? 'unknown');

/**
 * Токен автоматизації, якщо він є, інакше адреса. Рахувати саме токеном
 * важливо: один ярлик на телефоні — одне відро, і сусід за тим самим NAT не
 * витрачає чужий ліміт.
 *
 * Сам по собі цей ключ від перебору не захищає: кожен вигаданий токен дає нове
 * порожнє відро. Це не недогляд, а межа — поруч має стояти другий лічильник по
 * адресі, і саме він ловить потік підробок (див. `/api/automation` в index.js).
 */
export const automationKey = (req) => {
  const bearer = String(req.get?.('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const token = bearer || String(req.query?.token ?? '').trim();
  return token ? `t:${token}` : `ip:${clientIpKey(req)}`;
};
