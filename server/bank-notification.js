/**
 * Текст банківського пуша → покупка.
 *
 * Ярлик на телефоні ловить сповіщення банку й пересилає його текст як є, а
 * розбирається він тут. Свідомо не в ярлику: регулярний вираз у Командах iOS
 * набирають пальцем на телефоні, символ валюти там не перекласти в код без
 * стіни «Якщо», а коли банк змінить формат, виправлення тут доїде до всіх
 * одразу — ярлик на кожному телефоні довелося б переписувати.
 *
 * Моделі тут немає з тієї ж причини, що й у `bank-category.js`: формат
 * машинний і сталий. А пуш, не схожий на покупку (зарахування, відмова, код
 * входу, акція), має бути пропущений, а не «зрозумілий» як-небудь.
 */
import { FIAT_DENOMINATIONS } from './denomination.js';

const CURRENCY_SIGNS = {
  'zł': 'PLN',
  pln: 'PLN',
  '₴': 'UAH',
  'грн': 'UAH',
  uah: 'UAH',
  $: 'USD',
  usd: 'USD',
  '€': 'EUR',
  eur: 'EUR',
};

const toCurrency = (sign) => CURRENCY_SIGNS[String(sign ?? '').trim().toLocaleLowerCase('pl-PL')] ?? null;

/**
 * `1 234.56`, `1,234.56`, `57,67`, `5` → число. Кома без крапки — десяткова
 * (так пишуть суму українські банки), поряд із крапкою — розділювач тисяч
 * (так пише Bybit).
 */
const toAmount = (raw) => {
  let value = String(raw ?? '').replace(/[\s ]/g, '');
  value = value.includes('.') ? value.replace(/,/g, '') : value.replace(',', '.');
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

/** `Authorization of 5.23 USD at JMP S.A. BIEDRONKA 468 was made on 2026-10-06 18:45:20.` */
const BYBIT = /Authorization of\s+([\d.,]+)\s*([A-Z]{3})\s+at\s+(.+?)\s+was made on/i;

const AMOUNT = String.raw`(\d[\d  ]*(?:[.,]\d+)?)`;
const SIGN = String.raw`(zł|pln|₴|грн|uah|\$|usd|€|eur)`;

/**
 * `-5Zł(57.67₴) Транспорт. skycash.com, Warszawa` — і `-120.50₴ Продукти. Silpo, Kyiv`
 * для покупки у валюті картки, де дужок немає.
 *
 * Лише рядок, що **починається** мінусом: зарахування йде з плюсом, відмова й
 * скасування — словом, і жодне з них витратою не є. Прапорець `m` — бо ярлик
 * може переслати заголовок і текст разом, і тоді покупка стоїть другим рядком.
 *
 * Категорія банку — до першої «крапки з пробілом», тож `skycash.com` і
 * `JMP S.A.` у назві торговця її не обривають.
 */
const PRIVAT24 = new RegExp(
  String.raw`^[ \t]*-[ \t]*${AMOUNT}[ \t]*${SIGN}` +
    String.raw`(?:[ \t]*\([ \t]*${AMOUNT}[ \t]*${SIGN}[ \t]*\))?` +
    String.raw`[ \t]*(?:([^.\n]+?)\.[ \t]+)?([^,\n]+)`,
  'imu',
);

/**
 * Сума, що пішла з картки. Коли покупка в іншій валюті, банк пише обидві:
 * `-5Zł(57.67₴)`. Записуємо ту, що в дужках, — це рівно те, на скільки
 * поменшало на картці, з курсом і комісією банку. Ціна з чека дала б рахунок,
 * що щоразу розходиться з банком на різницю курсів.
 *
 * Якщо валюту картки облік не веде (євро), лишається ціна з чека.
 */
const pickCharged = (shown, charged) => {
  if (charged?.amount && FIAT_DENOMINATIONS.includes(charged.currency)) return charged;
  return shown;
};

const parsePrivat24 = (text) => {
  const match = PRIVAT24.exec(text);
  if (!match) return null;
  const [, shownAmount, shownSign, chargedAmount, chargedSign, bankCategory, merchant] = match;
  const shown = { amount: toAmount(shownAmount), currency: toCurrency(shownSign) };
  const charged = chargedAmount ? { amount: toAmount(chargedAmount), currency: toCurrency(chargedSign) } : null;
  const { amount, currency } = pickCharged(shown, charged);
  const name = String(merchant ?? '').trim();
  if (!amount || !currency || !name) return null;
  return {
    provider: 'privat24',
    type: 'expense',
    amount,
    currency,
    merchant: name,
    bankCategory: String(bankCategory ?? '').trim() || null,
  };
};

/**
 * ПУМБ: заголовок «Купівля», а текст —
 *
 *   10.00PLN / 116.42UAH (курс 11.64)
 *   doladowania.play.pl Poznan PL
 *   09-10-2026 23:16
 *   Картка: *7354
 *
 * Знака в сумі немає, і витрату від зарахування відрізняє лише заголовок. Тому
 * в ярлику фільтр «Купівля» стоїть на заголовку, а тут — запобіжник для
 * випадку, коли заголовок приїхав разом із текстом: тоді зарахування чи
 * повернення видно за словом і пропускаємо.
 */
const PUMB = new RegExp(
  String.raw`^[ \t]*${AMOUNT}[ \t]*${SIGN}` +
    String.raw`(?:[ \t]*\/[ \t]*${AMOUNT}[ \t]*${SIGN}[^\n]*)?` +
    String.raw`[ \t]*\n[ \t]*([^\n]+?)[ \t]*\n[ \t]*\d{2}[-.]\d{2}[-.]\d{4}`,
  'imu',
);

const PUMB_NOT_PURCHASE = /зарахуван|поповнен|повернен|відмов|відхилен|скасуван|переказ/i;

/**
 * `doladowania.play.pl Poznan PL` → `doladowania.play.pl`. Місто й код країни
 * відкидаються, бо інакше правило, вивчене для Biedronka у Кракові, не
 * впізнало б ту саму мережу у Варшаві.
 */
const stripPlace = (line) => {
  const parts = String(line ?? '').trim().split(/\s+/);
  if (parts.length >= 3 && /^[A-Z]{2}$/.test(parts[parts.length - 1])) return parts.slice(0, -2).join(' ');
  return parts.join(' ');
};

const parsePumb = (text) => {
  if (PUMB_NOT_PURCHASE.test(text)) return null;
  const match = PUMB.exec(text);
  if (!match) return null;
  const [, shownAmount, shownSign, chargedAmount, chargedSign, merchantLine] = match;
  const shown = { amount: toAmount(shownAmount), currency: toCurrency(shownSign) };
  const charged = chargedAmount ? { amount: toAmount(chargedAmount), currency: toCurrency(chargedSign) } : null;
  const { amount, currency } = pickCharged(shown, charged);
  const merchant = stripPlace(merchantLine);
  if (!amount || !currency || !merchant) return null;
  return { provider: 'pumb', type: 'expense', amount, currency, merchant, bankCategory: null };
};

const parseBybit = (text) => {
  const match = BYBIT.exec(text);
  if (!match) return null;
  const amount = toAmount(match[1]);
  const currency = String(match[2]).toUpperCase();
  const merchant = String(match[3]).trim();
  if (!amount || !merchant) return null;
  return { provider: 'bybit', type: 'expense', amount, currency, merchant, bankCategory: null };
};

/**
 * Текст сповіщення з того, що прислав ярлик.
 *
 * Команди iOS кладуть змінну «Сповіщення» в JSON то рядком, то словником
 * (заголовок, текст, програма) — залежно від типу поля, який людина обрала.
 * Словник розгортається в рядки, і далі розбір шукає покупку серед них так
 * само, як у заголовку з текстом разом.
 */
export const notificationText = (raw, depth = 0) => {
  if (typeof raw === 'string') return raw;
  if (raw === null || typeof raw !== 'object' || depth > 3) return '';
  const values = Array.isArray(raw) ? raw : Object.values(raw);
  return values
    .map((value) => notificationText(value, depth + 1))
    .filter((value) => value.trim())
    .join('\n');
};

/**
 * @returns {{ provider: string, type: 'expense', amount: number, currency: string,
 *   merchant: string, bankCategory: string|null } | null} `null` — це не покупка.
 */
export const parseBankNotification = (raw) => {
  const text = String(raw ?? '');
  if (!text.trim()) return null;
  return parseBybit(text) ?? parsePrivat24(text) ?? parsePumb(text);
};
