/**
 * Підписка, яку списав і сервер, і банк.
 *
 * Автосписання записує витрату в день підписки саме для того, щоб облік не
 * залежав від людини. Але коли картка підключена до Denga (вебхук monobank,
 * пуш банку через ярлик), ті самі гроші приходять ще й операцією з банку — і
 * без звірки одна підписка ставала двома витратами, а баланс картки в Denga
 * відставав від справжнього на її суму.
 *
 * Лишається завжди банківський запис: у ньому справжня сума в справжній
 * валюті й справжня картка, тоді як автосписання — лише очікування.
 *
 * Зводяться лише тоді, коли:
 *
 *   - назва підписки впізнається в назві торговця (`Netflix` у
 *     `NETFLIX.COM AMSTERDAM`, `ChatGPT` в `OPENAI *CHATGPT SUBSCR`). Сума й
 *     дата без назви — не доказ: кава за ті самі 50 ₴ у день підписки лишається
 *     кавою;
 *   - сума збігається з точністю до курсу й банківської націнки (10 %):
 *     Netflix за $15.49 з гривневої картки — це гривні за курсом банку, а не
 *     наш курс дня;
 *   - між днем підписки й днем операції не більше трьох днів: банк знімає
 *     гроші на день-два раніше чи пізніше, ніж написано в підписці.
 *
 * Тут лише правила — без бази, щоб їх можна було перевірити на прикладах.
 */
import { foldName } from './bank-category.js';

export const SUBSCRIPTION_MATCH_DAYS = 3;
export const SUBSCRIPTION_MATCH_TOLERANCE = 0.1;

/**
 * Слова з назви тарифу, а не сервісу. «Spotify Premium» має впізнаватися за
 * `spotify`, а не за `premium` — інакше будь-який «Premium» у виписці ставав
 * би кандидатом.
 */
const GENERIC_WORDS = new Set(
  [
    'premium', 'plus', 'pro', 'family', 'basic', 'standard', 'individual', 'duo', 'student',
    'subscription', 'subscr', 'plan', 'monthly', 'yearly', 'annual', 'one', 'membership', 'account',
    'преміум', 'премиум', 'підписка', 'подписка', 'тариф', 'сімейна', 'семейная',
  ].map(foldName),
);

/**
 * Під якою назвою сервіс з'являється у виписці, коли вона не збігається з
 * назвою підписки: ChatGPT списує OpenAI, Gemini й YouTube — Google.
 */
const BILLED_AS = {
  chatgpt: ['openai'],
  openai: ['chatgpt'],
  claude: ['anthropic'],
  anthropic: ['claude'],
  gemini: ['google'],
  youtube: ['google'],
  icloud: ['apple'],
  xbox: ['microsoft'],
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Слова назви підписки, за якими її можна впізнати у виписці. */
const nameTerms = (name) => {
  const words = foldName(name)
    .split(' ')
    .filter((word) => word.length >= 3 && !GENERIC_WORDS.has(word));
  return [...new Set(words.flatMap((word) => [word, ...(BILLED_AS[word] ?? [])]))];
};

/**
 * Чи схожа назва торговця на цю підписку.
 *
 * Довге слово шукається будь-де в злитій назві: банки клеять назву з доменом і
 * номером (`NETFLIX.COM`, `SPOTIFYP1A2B3`). Слово з трьох літер — лише цілим
 * словом або з приліпленим номером, бо `hbo` чи `max` усередині чужої назви —
 * випадковість, а не підписка.
 */
export const subscriptionNameMatches = (name, merchant) => {
  const folded = foldName(merchant);
  if (!folded) return false;
  const compact = folded.replace(/ /g, '');
  return nameTerms(name).some((term) =>
    term.length >= 4
      ? compact.includes(term)
      : new RegExp(`(?:^| )${escapeRegExp(term)}(?=$| |\\d)`).test(folded),
  );
};

const DAY_MS = 24 * 60 * 60 * 1000;

const dayMs = (day) => Date.parse(`${String(day ?? '').slice(0, 10)}T00:00:00.000Z`);

/** День `YYYY-MM-DD`, зсунутий на `days`. */
export const shiftDay = (day, days) => new Date(dayMs(day) + days * DAY_MS).toISOString().slice(0, 10);

/** Межі пошуку пари для дня: `[від, до]` включно. */
export const matchWindow = (day) => [shiftDay(day, -SUBSCRIPTION_MATCH_DAYS), shiftDay(day, SUBSCRIPTION_MATCH_DAYS)];

/**
 * Наскільки списання підписки й операція з банку схожі на одне й те саме.
 *
 * @param charge `{ name, amount, currency, chargeDate }` — що підписка мала списати.
 * @param bankOp `{ merchant, amount, currency, day }` — що прийшло з банку.
 * @param convert `(amount, from, to) => number|null` — той самий перерахунок, що й для рахунків.
 * @returns `{ amountGap, dayGap }` або `null`, якщо це різні гроші.
 */
export const compareSubscriptionCharge = (charge, bankOp, convert) => {
  if (!charge || !bankOp) return null;
  const dayGap = Math.abs(dayMs(charge.chargeDate) - dayMs(bankOp.day)) / DAY_MS;
  if (!Number.isFinite(dayGap) || dayGap > SUBSCRIPTION_MATCH_DAYS) return null;

  const bankAmount = Number(bankOp.amount);
  const planned = Number(charge.amount);
  if (!(bankAmount > 0) || !(planned > 0)) return null;
  const sameUnit = String(charge.currency ?? '').toUpperCase() === String(bankOp.currency ?? '').toUpperCase();
  const expected = sameUnit ? planned : Number(convert?.(planned, charge.currency, bankOp.currency));
  if (!(expected > 0)) return null;
  const amountGap = Math.abs(expected - bankAmount) / Math.max(expected, bankAmount);
  if (amountGap > SUBSCRIPTION_MATCH_TOLERANCE) return null;

  if (!subscriptionNameMatches(charge.name, bankOp.merchant)) return null;
  return { amountGap, dayGap };
};

const closest = (pairs) =>
  pairs
    .filter((pair) => pair.score)
    .sort((a, b) => a.score.amountGap - b.score.amountGap || a.score.dayGap - b.score.dayGap)[0]?.item ?? null;

/** Автосписання, яке ця операція з банку насправді підтверджує, або `null`. */
export const findChargeForBankOperation = (bankOp, charges = [], convert) =>
  closest(charges.map((item) => ({ item, score: compareSubscriptionCharge(item, bankOp, convert) })));

/** Операція з банку, яка вже покрила це списання підписки, або `null`. */
export const findBankOperationForCharge = (charge, bankOps = [], convert) =>
  closest(bankOps.map((item) => ({ item, score: compareSubscriptionCharge(charge, item, convert) })));
