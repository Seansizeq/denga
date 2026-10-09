/**
 * Quick entry from a phone automation (iOS Shortcuts widget, Android tasker),
 * authenticated by the personal token rather than Telegram initData.
 *
 * The payload shape is dictated by Shortcuts: its `Choose from List` action can
 * only render plain strings, so options travel as a flat `label -> id`
 * dictionary. The shortcut picks over `All Keys` and reads the chosen key back
 * out of the same dictionary to recover the id. An array of objects would show
 * up as raw JSON in the picker.
 */
import {
  DENOMINATIONS,
  FIAT_DENOMINATIONS,
  denominationPrecision,
  isFiatDenomination,
  normalizeDenomination,
} from './denomination.js';

/**
 * Поля, які розуміє `/api/automation/transaction`. Ключ — як його пише код,
 * значення — для звірки з тим, що набрала людина.
 */
const AUTOMATION_FIELDS = [
  'amount',
  'currency',
  'categoryId',
  'account',
  'accountKey',
  'note',
  'date',
  'text',
  'merchant',
  'notification',
  // Напрямок пуша, коли банк пише його лише в заголовку (ПУМБ: «Зарахування»),
  // а ярлик знає його з фільтра автоматизації.
  'type',
];

/** `Account`, ` account `, `category_id` → один вигляд для звірки. */
const fieldShape = (key) => String(key ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');

const FIELD_BY_SHAPE = new Map(AUTOMATION_FIELDS.map((field) => [fieldShape(field), field]));

/**
 * Тіло запиту ярлика — до того вигляду, на який розраховує сервер.
 *
 * Назву поля в Командах iOS набирають на телефонній клавіатурі, а вона сама
 * робить першу літеру великою: `Account` замість `account`. Сервер, що
 * розрізняв регістр, просто не бачив такого поля — і покупка тихо
 * записувалася без рахунку. Тепер регістр, пробіли й підкреслення не важать.
 *
 * Чого впізнати не вдалося, повертається окремо: найчастіше це рядок, де
 * назву й значення переставлено місцями (`usdt` ліворуч, `account` праворуч),
 * і людині треба про це сказати, а не мовчки ігнорувати.
 *
 * @returns {{ body: object, unknownFields: string[], isObject: boolean }}
 */
export const normalizeAutomationBody = (raw) => {
  const isObject = raw !== null && typeof raw === 'object' && !Array.isArray(raw);
  if (!isObject) return { body: {}, unknownFields: [], isObject: false };
  const body = {};
  const unknownFields = [];
  for (const [key, value] of Object.entries(raw)) {
    const field = FIELD_BY_SHAPE.get(fieldShape(key));
    if (!field) {
      if (fieldShape(key)) unknownFields.push(String(key).trim());
      continue;
    }
    // Точне написання має перевагу над схожим, якщо прийшли обидва.
    if (key === field || !(field in body)) body[field] = value;
  }
  return { body, unknownFields, isObject: true };
};

/** Один рядок, який ярлик покаже в сповіщенні, коли в тілі є зайве. */
export const unknownFieldsWarning = (unknownFields = []) => {
  if (unknownFields.length === 0) return '';
  const names = unknownFields.slice(0, 3).map((name) => `«${name.slice(0, 30)}»`).join(', ');
  return `⚠️ Невідоме поле ${names}: ліворуч пишеться назва поля (account, notification…), праворуч — значення.`;
};

/**
 * Matches what the smart parser keeps, so a dictated entry and a picked one
 * read the same in the history. (The account used to be appended to the note
 * as well; it now has its own `accountKey` column.)
 */
export const AUTOMATION_NOTE_MAX = 60;

const FALLBACK_ACCOUNT_EMOJI = '💳';
const SECTION_EMOJI = {
  bank: '💳',
  cash: '💵',
  crypto: '🪙',
  stocks: '📈',
  debt: '🤝',
  goal: '🎯',
};

/**
 * Sections in wallet order, because `sort_index` is numbered per section: order
 * by it alone and cards, crypto, debts and goals interleave into what looks
 * like no order at all.
 */
const SECTION_ORDER = ['bank', 'cash', 'crypto', 'stocks', 'debt', 'goal'];

const sectionRank = (section) => {
  const index = SECTION_ORDER.indexOf(String(section ?? ''));
  return index === -1 ? SECTION_ORDER.length : index;
};

/** "Інше" is what you pick when nothing else fits, so it belongs at the bottom. */
const CATCH_ALL_CATEGORY_IDS = ['other_expense', 'other_income'];

const label = (emoji, name) => `${emoji} ${name}`.trim();

/**
 * Labels are the dictionary's keys, so they have to be unique: two accounts
 * both called "Картка" would otherwise collapse into one entry, and the picker
 * would quietly spend from whichever of them was written last.
 */
const putUnique = (target, key, value) => {
  let unique = key;
  for (let n = 2; Object.prototype.hasOwnProperty.call(target, unique); n += 1) {
    unique = `${key} (${n})`;
  }
  target[unique] = value;
};

/**
 * `label -> id` for resolving a picked row back to what it stands for.
 *
 * @param type 'expense' | 'income' | 'all' — which categories the picker offers.
 */
export const buildOptionMaps = ({ categories = [], accounts = [], type = 'expense' } = {}) => {
  const wantedType = type === 'income' ? 'income' : type === 'all' ? null : 'expense';

  // Both sorts are stable, so anything the caller already ordered — the
  // built-in categories, the wallet's own arrangement within a section — keeps
  // that order inside its group.
  const orderedCategories = [...categories].sort(
    (a, b) =>
      Number(CATCH_ALL_CATEGORY_IDS.includes(String(a?.id ?? ''))) -
      Number(CATCH_ALL_CATEGORY_IDS.includes(String(b?.id ?? '')))
  );
  const orderedAccounts = [...accounts].sort(
    (a, b) =>
      sectionRank(a?.section) - sectionRank(b?.section) ||
      (Number(a?.sortIndex) || 0) - (Number(b?.sortIndex) || 0)
  );

  const categoryOptions = {};
  for (const category of orderedCategories) {
    const id = String(category?.id ?? '').trim();
    if (!id) continue;
    if (wantedType && category?.type !== wantedType) continue;
    const name = String(category?.name ?? '').trim() || id;
    // Names only. Emoji existed for the handful of built-in categories, so a
    // wallet with its own categories showed a few pictures and then a column of
    // identical placeholder tags — worse to read than plain names.
    putUnique(categoryOptions, name, id);
  }

  const accountOptions = {};
  for (const account of orderedAccounts) {
    const key = String(account?.accountKey ?? '').trim().toLowerCase();
    if (!key) continue;
    const name = String(account?.name ?? '').trim() || key;
    const emoji = SECTION_EMOJI[String(account?.section ?? '')] ?? FALLBACK_ACCOUNT_EMOJI;
    putUnique(accountOptions, label(emoji, name), key);
  }

  return { categories: categoryOptions, accounts: accountOptions };
};

/**
 * What the picker actually receives: an ordered list of labels.
 *
 * A JSON object would be the obvious shape — label straight to id — but
 * Shortcuts parses one into a plain dictionary, which has no order, and its
 * `All Keys` then hands the picker rows in whatever order the dictionary
 * happens to hold them. Sorting on this side simply never survives the trip. A
 * JSON array does, and it also spares the shortcut the `All Keys` step: the
 * chosen row goes straight into the request, and the label is resolved back to
 * an id here.
 *
 * @param list 'categories' | 'accounts' | 'currencies' — that one list at the
 *   top level.
 */
export const buildOptionsPayload = ({ categories = [], accounts = [], type = 'expense', list } = {}) => {
  const maps = buildOptionMaps({ categories, accounts, type });
  if (list === 'accounts') return Object.keys(maps.accounts);
  if (list === 'categories') return Object.keys(maps.categories);
  // Crypto is deliberately absent: a quick add is a shop receipt, and a token
  // amount belongs to the wallet that holds it rather than to a picker.
  if (list === 'currencies') return [...FIAT_DENOMINATIONS];
  return {
    categories: Object.keys(maps.categories),
    accounts: Object.keys(maps.accounts),
    currencies: [...FIAT_DENOMINATIONS],
  };
};

/**
 * Both the stable id and the picker's own label are accepted.
 *
 * Shortcuts hands the chosen row back as text, so insisting on the id forces
 * the shortcut to translate the label back through a second dictionary lookup —
 * two more actions per picker, each with an "in" field that is easy to point at
 * the wrong action, since every lookup in the list is named identically. The
 * label round-trips through the same map that produced it, so accepting it
 * costs nothing here and removes the step people get wrong.
 */
const findByIdOrLabel = (raw, items, labels, matches) => {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const direct = items.find((item) => matches(item, value));
  if (direct) return direct;
  const id = labels[value];
  return id ? items.find((item) => matches(item, id)) ?? null : null;
};

const plainName = (value) =>
  String(value ?? '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase('uk-UA');

/**
 * Рахунок за назвою так, як її видно в застосунку, — без емодзі з пікера.
 *
 * Ярлик, складений руками, а не через список вибору, пише саме так:
 * «Банківська карта», а не «💳 Банківська карта». Відмовляти йому через
 * картинку означало б губити кожну витрату, а ярлик на пуш банку працює, коли
 * телефон у кишені, і помилку ніхто не побачить.
 *
 * Лише коли така назва одна: два рахунки «Картка» за назвою не розрізнити, і
 * чесна помилка краща за списання не з того.
 */
const findAccountByName = (raw, accounts) => {
  const wanted = plainName(raw);
  if (!wanted) return null;
  const found = accounts.filter((account) => plainName(account?.name) === wanted);
  return found.length === 1 ? found[0] : null;
};

const matchesCategory = (category, value) => String(category?.id ?? '') === value;

/**
 * Рахунок, як його назвав ярлик: ключ, рядок пікера з емодзі або просто
 * назва з застосунку. `null` — такого рахунку немає (або назва неоднозначна).
 */
export const resolveAutomationAccount = (raw, accounts = []) => {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const options = buildOptionMaps({ categories: [], accounts, type: 'all' });
  return findByIdOrLabel(value, accounts, options.accounts, matchesAccount) ?? findAccountByName(value, accounts);
};

const matchesAccount = (account, value) =>
  String(account?.accountKey ?? '').trim().toLowerCase() === value.toLowerCase();

/**
 * The unit of a quick add that did not state one.
 *
 * It follows the wallet's default currency, never the account the money leaves.
 * Buying groceries in Warsaw with a Ukrainian card is a zloty expense: taking
 * the account's own unit relabelled the figure read off the price tag as
 * hryvnia, and the ledger was out by a factor of ten every time.
 *
 * The rule is the same for every account — a card, a cash box, a token wallet.
 * Whatever the amount is counted in, the balance settles the difference at the
 * day's rate, so the account still moves by the right number.
 *
 * The account's own unit is only the fallback, for a wallet whose default
 * currency is not known yet.
 */
const quickAddCurrency = (accountDenomination, defaultCurrency) => {
  const preferred = String(defaultCurrency ?? '').trim().toUpperCase();
  if (isFiatDenomination(preferred)) return preferred;
  return accountDenomination ?? normalizeDenomination(null);
};

/**
 * Validates one quick-add transaction against the user's own categories and
 * accounts. Both lists are the caller's, so an id that belongs to somebody else
 * fails here rather than reaching the database.
 *
 * @param defaultCurrency the wallet's own currency, used when the payload names
 *   none. See `quickAddCurrency`.
 */
export const validateAutomationTransaction = (
  body,
  { categories = [], accounts = [], defaultCurrency = null } = {}
) => {
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400, code: 'INVALID_AMOUNT', error: 'сума має бути більшою за 0' };
  }

  const options = buildOptionMaps({ categories, accounts, type: 'all' });

  const category = findByIdOrLabel(body?.categoryId, categories, options.categories, matchesCategory);
  if (!category) {
    return { ok: false, status: 400, code: 'INVALID_CATEGORY', error: 'невідома категорія' };
  }

  const rawAccount = String(body?.account ?? body?.accountKey ?? '').trim();
  let account = null;
  if (rawAccount) {
    account =
      findByIdOrLabel(rawAccount, accounts, options.accounts, matchesAccount) ??
      findAccountByName(rawAccount, accounts);
    if (!account) {
      // Назва в помилці — бо інакше не видно, що саме в ярлику не так.
      return { ok: false, status: 400, code: 'INVALID_ACCOUNT', error: `невідомий рахунок «${rawAccount}»` };
    }
  }

  // An unsupported code is refused instead of being folded into UAH: a typo in
  // a shortcut is typed once and then repeated on every run, so a silent
  // fallback would keep booking zloty as hryvnia for weeks.
  const rawCurrency = String(body?.currency ?? '').trim().toUpperCase();
  if (rawCurrency && !DENOMINATIONS.includes(rawCurrency)) {
    return { ok: false, status: 400, code: 'INVALID_CURRENCY', error: `валюта має бути однією з ${DENOMINATIONS.join(', ')}` };
  }
  const accountDenomination = account ? normalizeDenomination(account.primaryCurrency) : null;
  const currency = rawCurrency
    ? normalizeDenomination(rawCurrency)
    : quickAddCurrency(accountDenomination, defaultCurrency);

  const note = String(body?.note ?? '').trim().slice(0, AUTOMATION_NOTE_MAX);
  const rawDate = String(body?.date ?? '').trim();
  if (rawDate && (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(Date.parse(`${rawDate}T00:00:00Z`)))) {
    return { ok: false, status: 400, code: 'INVALID_DATE', error: 'дата має бути у форматі YYYY-MM-DD' };
  }
  // The category's own type is authoritative: a picker cannot make "Зарплата"
  // an expense.
  const type = category.type === 'income' ? 'income' : 'expense';

  return {
    ok: true,
    amount,
    currency,
    categoryId: String(category.id),
    categoryName: String(category.name ?? category.id),
    type,
    date: rawDate || new Date().toISOString().slice(0, 10),
    account: account ? String(account.accountKey) : null,
    accountName: account ? String(account.name ?? account.accountKey) : null,
    // What the balance will actually move in, so the caller can show the
    // converted figure next to the one that was typed.
    accountCurrency: accountDenomination,
    note: note || String(category.name ?? category.id),
  };
};

const formatAmount = (amount, currency) => {
  const rounded = Number(Number(amount).toFixed(denominationPrecision(currency)));
  return String(rounded);
};

/**
 * The one line the automation shows in its notification. Built here so the
 * shortcut only has to print a field instead of assembling text on the phone.
 *
 * When the amount was entered in a different unit from the account it leaves,
 * the converted figure rides along: without it the notification reads "50 PLN"
 * off a hryvnia card and leaves you guessing what the balance actually moved
 * by.
 */
export const buildResultMessage = ({
  type,
  amount,
  currency,
  categoryName,
  accountName,
  accountCurrency = null,
  convertedAmount = null,
}) => {
  const head = type === 'income' ? '✅ Дохід' : '✅ Витрата';
  // A zero is treated as "no rate to hand", which is what a missing crypto
  // price comes back as: better to print one figure than an invented second.
  const showsConversion =
    Boolean(accountCurrency) &&
    accountCurrency !== currency &&
    Number.isFinite(Number(convertedAmount)) &&
    Number(convertedAmount) > 0;
  const converted = showsConversion
    ? ` ≈ ${formatAmount(convertedAmount, accountCurrency)} ${accountCurrency}`
    : '';
  return [
    `${head} ${formatAmount(amount, currency)} ${currency}${converted}`,
    categoryName,
    accountName,
  ]
    .filter(Boolean)
    .join(' · ');
};
