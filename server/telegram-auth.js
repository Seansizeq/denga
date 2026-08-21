/**
 * Перевірка `initData` міні-застосунку Telegram.
 *
 * Логіка живе окремим модулем, бо `index.js` на верхньому рівні піднімає базу,
 * бота й сервер — імпортувати його з тесту неможливо. А це саме та частина, яку
 * найменше можна лишати неперевіреною: помилка тут не ламає застосунок, вона
 * тихо віддає чужі дані.
 */
import crypto from 'crypto';

/** Скільки живе рядок за замовчуванням, якщо викликач не сказав інакше. */
export const DEFAULT_INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;
/** Запас на розбіжність годинників клієнта й сервера. */
export const DEFAULT_CLOCK_SKEW_SEC = 5 * 60;

export const AUTH_CODES = {
  invalid: 'AUTH_INVALID_TELEGRAM_INIT_DATA',
  expired: 'AUTH_INIT_DATA_EXPIRED',
  misconfigured: 'AUTH_SERVER_MISCONFIGURED',
};

/**
 * Порівняння підпису за сталий час: розбіжність у першому байті не має
 * вимірюватися швидше за розбіжність в останньому, інакше хеш добирається
 * побайтово.
 */
export const hashesMatch = (expected, received) => {
  const a = Buffer.from(String(expected), 'utf8');
  const b = Buffer.from(String(received), 'utf8');
  // timingSafeEqual кидає на різній довжині, а сама довжина секретом не є.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

/**
 * @returns {{ ok: true, userId: string } | { ok: false, code: string }}
 */
export const verifyTelegramInitData = (
  initDataRaw,
  {
    botToken,
    maxAgeSec = DEFAULT_INIT_DATA_MAX_AGE_SEC,
    clockSkewSec = DEFAULT_CLOCK_SKEW_SEC,
    nowMs = Date.now(),
  } = {}
) => {
  // Без токена ключ HMAC порахувався б від порожнього рядка — константи, яку
  // може обчислити будь-хто, тобто підпис став би підробним для довільного
  // user.id. Відсутність токена — це відмова, а не «пропустити».
  if (!botToken) return { ok: false, code: AUTH_CODES.misconfigured };

  const invalid = { ok: false, code: AUTH_CODES.invalid };
  if (typeof initDataRaw !== 'string' || !initDataRaw.trim()) return invalid;

  const params = new URLSearchParams(initDataRaw.trim());
  const hash = params.get('hash');
  if (!hash) return invalid;

  const dataCheckString = [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (!hashesMatch(computedHash, hash)) return invalid;

  // Строк придатності перевіряється вже після підпису: до нього `auth_date` —
  // просто рядок, який міг написати хто завгодно.
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || authDate <= 0) return invalid;
  const nowSec = Math.floor(nowMs / 1000);
  // Дата з майбутнього далі за похибку годинника — ознака підробки, а не сесії.
  if (authDate - nowSec > clockSkewSec) return invalid;
  if (nowSec - authDate > maxAgeSec) return { ok: false, code: AUTH_CODES.expired };

  const userRaw = params.get('user');
  if (!userRaw) return invalid;
  let user;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return invalid;
  }
  const userId = user && user.id ? String(user.id).trim() : '';
  if (!userId) return invalid;
  return { ok: true, userId };
};

/**
 * Підписаний `initData` — для тестів і для ручної перевірки живого сервера.
 * Тримається поруч із перевіркою навмисно: якщо колись зміниться формат
 * `data_check_string`, обидві половини поїдуть разом і тест це впіймає.
 */
export const signTelegramInitData = (fields, botToken) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) params.set(k, String(v));
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex'));
  return params.toString();
};
