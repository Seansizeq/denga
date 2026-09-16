/**
 * Персональний API monobank: підключення картки й розбір того, що прилітає
 * вебхуком.
 *
 * Модуль навмисно нічого не знає ні про базу, ні про Telegram — лише формат
 * банку. Так його можна перевірити тестами без мережі, а маршрут поверх нього
 * лишається коротким.
 *
 * Про валюту тут є одна пастка, через яку легко зіпсувати облік. У виписці
 * три поля: `amount` — сума у валюті **рахунку**, `operationAmount` — сума у
 * валюті операції, `currencyCode` — код ISO 4217. Що саме описує
 * `currencyCode`, у документації сказано неоднозначно, і різні клієнти читають
 * його по-різному. Тому ми його **не питаємо**: валюту беремо з рахунку Denga,
 * до якого привʼязана картка, а суму — з `amount`, яка гарантовано в тій самій
 * валюті. Покупка в Варшаві з гривневої картки списує гривню, і саме гривня
 * має лягти в облік: рахунок веде баланс у ній.
 */

const DEFAULT_API_BASE = 'https://api.monobank.ua';

/** Скільки чекаємо на банк. Довше не має сенсу: людина стоїть над екраном. */
const REQUEST_TIMEOUT_MS = 10_000;

export const monobankApiBase = () =>
  String(process.env.MONOBANK_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');

/**
 * Відмова з кодом, який маршрут перекладе користувачу.
 *
 * Окремий клас, бо саме тут різниця між «ви вставили не той токен» і «банк
 * зараз недоступний» — це різні поради людині, а не різний текст однієї.
 */
export class MonobankError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'MonobankError';
    this.code = code;
  }
}

const request = async (path, { token, method = 'GET', body, fetchImpl = fetch } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(`${monobankApiBase()}${path}`, {
      method,
      headers: {
        'X-Token': String(token ?? ''),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    throw new MonobankError(
      error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK',
      error?.message ?? 'monobank request failed',
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 403 || res.status === 401) throw new MonobankError('BAD_TOKEN');
  // Клієнтську інформацію банк віддає не частіше ніж раз на 60 секунд на
  // токен. Це не аварія і не привід щось перевстановлювати — просто треба
  // зачекати, і людині варто сказати саме це.
  if (res.status === 429) throw new MonobankError('RATE_LIMITED');
  if (!res.ok) throw new MonobankError('BANK_ERROR', `monobank responded ${res.status}`);

  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new MonobankError('BANK_ERROR', 'monobank returned malformed JSON');
  }
};

const MONOBANK_ACCOUNT_TYPES = {
  black: 'Чорна',
  white: 'Біла',
  platinum: 'Platinum',
  iron: 'Iron',
  yellow: 'Жовта',
  fop: 'ФОП',
  eAid: 'єПідтримка',
};

export const CURRENCY_BY_NUMERIC_CODE = {
  980: 'UAH',
  985: 'PLN',
  840: 'USD',
  978: 'EUR',
  826: 'GBP',
};

export const currencyFromNumericCode = (code) =>
  CURRENCY_BY_NUMERIC_CODE[Number.parseInt(String(code ?? ''), 10)] ?? null;

/** Останні чотири цифри — те, за чим людина впізнає свою картку у списку. */
const maskedTail = (maskedPan) => {
  const pan = Array.isArray(maskedPan) ? String(maskedPan[0] ?? '') : '';
  const tail = pan.replace(/\D/g, '').slice(-4);
  return tail.length === 4 ? tail : '';
};

/**
 * Рахунки й банки, придатні для звʼязування, у вигляді, зрозумілому екрану
 * налаштувань.
 *
 * Банки (`jars`) теж повертаємо: люди відкладають на них і хочуть бачити ці
 * рухи в обліку так само, як покупки.
 */
export const describeMonobankAccounts = (clientInfo) => {
  const accounts = Array.isArray(clientInfo?.accounts) ? clientInfo.accounts : [];
  const jars = Array.isArray(clientInfo?.jars) ? clientInfo.jars : [];
  return [
    ...accounts.map((account) => {
      const tail = maskedTail(account?.maskedPan);
      const type = MONOBANK_ACCOUNT_TYPES[String(account?.type ?? '')] ?? String(account?.type ?? 'Картка');
      return {
        id: String(account?.id ?? ''),
        kind: 'account',
        label: tail ? `${type} ·· ${tail}` : type,
        currency: currencyFromNumericCode(account?.currencyCode),
        balance: Number.isFinite(Number(account?.balance)) ? Number(account.balance) / 100 : null,
      };
    }),
    ...jars.map((jar) => ({
      id: String(jar?.id ?? ''),
      kind: 'jar',
      label: `🏦 ${String(jar?.title ?? 'Банка').trim() || 'Банка'}`,
      currency: currencyFromNumericCode(jar?.currencyCode),
      balance: Number.isFinite(Number(jar?.balance)) ? Number(jar.balance) / 100 : null,
    })),
  ].filter((row) => row.id);
};

export const fetchMonobankClientInfo = async (token, { fetchImpl = fetch } = {}) => {
  const info = await request('/personal/client-info', { token, fetchImpl });
  if (!info || typeof info !== 'object') throw new MonobankError('BANK_ERROR', 'empty client-info');
  return info;
};

/**
 * Прописати адресу вебхука.
 *
 * Порожній рядок — це і є відключення: іншого способу банк не дає.
 *
 * Перед тим, як увімкнути, monobank сам стукає на цю адресу й чекає 200. Тобто
 * маршрут має вже існувати й відповідати **до** цього виклику — інакше банк
 * просто відмовить, і виглядатиме це як хибний токен.
 */
export const setMonobankWebhook = async (token, url, { fetchImpl = fetch } = {}) => {
  await request('/personal/webhook', {
    token,
    method: 'POST',
    body: { webHookUrl: String(url ?? '') },
    fetchImpl,
  });
  return true;
};

/**
 * Розібрати тіло вебхука.
 *
 * Банк надсилає `{ type: 'StatementItem', data: { account, statementItem } }`.
 * Усе, що не має цієї форми, — не операція: під час встановлення вебхука сюди
 * прилітає перевірковий запит без тіла, і його треба відрізнити від виписки, а
 * не намагатися провести в облік.
 *
 * @returns {{ accountId: string, item: object } | null}
 */
export const normalizeStatementEvent = (body) => {
  if (!body || typeof body !== 'object') return null;
  if (String(body.type ?? '') !== 'StatementItem') return null;
  const account = String(body?.data?.account ?? '').trim();
  const item = body?.data?.statementItem;
  if (!account || !item || typeof item !== 'object') return null;
  if (!String(item.id ?? '').trim()) return null;
  if (!Number.isFinite(Number(item.amount))) return null;
  return { accountId: account, item };
};

/**
 * Одна операція у вигляді, придатному для запису.
 *
 * Суми банк рахує в мінімальних одиницях (копійках, грошах), тож скрізь поділ
 * на сто. Знак несе напрямок: відʼємна сума — витрата, додатна — надходження;
 * далі йде абсолютне значення, бо облік зберігає напрямок окремим полем.
 *
 * `hold` не відкидаємо. Заблокована сума — це вже витрачені гроші з погляду
 * людини, яка щойно розплатилася; чекати на остаточне списання означало б
 * показати картку через день, коли покупка давно забута.
 */
export const statementToEntry = ({ item, accountCurrency } = {}) => {
  const rawAmount = Number(item?.amount);
  if (!Number.isFinite(rawAmount) || rawAmount === 0) return null;
  const timeSeconds = Number(item?.time);
  const timeMs = Number.isFinite(timeSeconds) && timeSeconds > 0 ? timeSeconds * 1000 : Date.now();
  const comment = String(item?.comment ?? '').trim();
  const description = String(item?.description ?? '').trim();
  return {
    externalId: String(item.id),
    type: rawAmount < 0 ? 'expense' : 'income',
    amount: Math.abs(rawAmount) / 100,
    currency: accountCurrency,
    // Опис — те, що бачить людина у виписці. Коментар до переказу конкретніший
    // за назву відправника, тож коли він є, показуємо його.
    merchant: comment || description || 'Операція',
    mcc: Number.isInteger(Number(item?.mcc)) ? Number(item.mcc) : null,
    hold: item?.hold === true,
    timeMs,
  };
};
