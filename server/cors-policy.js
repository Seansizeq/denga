/**
 * Кого пускати крос-доменно.
 *
 * Логіка винесена окремо з тієї ж причини, що й перевірка `initData`:
 * `index.js` на верхньому рівні піднімає базу, бота й сервер, тож із тесту його
 * не імпортувати. А помилка тут не ламає застосунок — вона тихо відчиняє API
 * чужим сторінкам.
 *
 * Раніше порожній `CORS_ORIGINS` означав «дозволити всім»: незаданий параметр
 * давав найм'якшу поведінку, тобто забути його налаштувати було найгіршим із
 * можливих варіантів. Тепер незаданий список нікого не додає — свій же фронтенд
 * проходить не за списком, а за збігом хоста.
 */

/** Хост з рядка Origin; `''`, якщо це не валідний absolute URL. */
const originHost = (origin) => {
  try {
    return new URL(String(origin)).host;
  } catch {
    return '';
  }
};

/**
 * Фронтенд віддає той самий Express зі статики, тож у бою запити йдуть на
 * власний хост. Браузер шле `Origin` і для таких запитів (будь-який POST),
 * тому без цієї перевірки суворий список ламав би застосунок на порожньому
 * `CORS_ORIGINS` — саме та зміна, після якої «полагодили» б поверненням
 * дозволу всім.
 */
export const isSameOriginRequest = (requestHost, origin) => {
  const host = String(requestHost ?? '').trim().toLowerCase();
  if (!host) return false;
  return originHost(origin).toLowerCase() === host;
};

/** Vite на 5173 ходить через власний проксі, але прямий запит із браузера теж має працювати. */
export const isLocalhostOrigin = (origin) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(origin ?? ''));

/**
 * @param {object} params
 * @param {string | undefined} params.origin заголовок `Origin` запиту
 * @param {string | undefined} params.requestHost заголовок `Host` запиту
 * @param {string[]} [params.allowedOrigins] явний список із `CORS_ORIGINS`
 * @param {boolean} [params.isProduction]
 */
export const isOriginAllowed = ({ origin, requestHost, allowedOrigins = [], isProduction = true }) => {
  // Запит без Origin — не браузерний: curl, ярлик на телефоні, сам Telegram.
  // CORS таких і не стосується, блокувати їх означало б ламати автоматизацію,
  // нічого не захистивши: політика однакового походження живе в браузері.
  if (!origin) return true;
  if (isSameOriginRequest(requestHost, origin)) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (!isProduction && isLocalhostOrigin(origin)) return true;
  return false;
};

/** Розбір `CORS_ORIGINS`: список через кому, порожні елементи ігноруються. */
export const parseAllowedOrigins = (raw) =>
  String(raw ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
