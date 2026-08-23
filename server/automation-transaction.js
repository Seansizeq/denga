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
import { DENOMINATIONS, denominationPrecision, normalizeDenomination } from './denomination.js';

/**
 * The note travels to the same 120-char column as every other transaction, and
 * the account is appended to it as ` Account: <key>` (up to 50 more chars).
 * Sixty leaves room for both, and matches what the smart parser already keeps.
 */
export const AUTOMATION_NOTE_MAX = 60;

const FALLBACK_CATEGORY_EMOJI = '🏷';
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
    putUnique(categoryOptions, label(category?.emoji || FALLBACK_CATEGORY_EMOJI, name), id);
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
 * @param list 'categories' | 'accounts' — that one list at the top level.
 */
export const buildOptionsPayload = ({ categories = [], accounts = [], type = 'expense', list } = {}) => {
  const maps = buildOptionMaps({ categories, accounts, type });
  if (list === 'accounts') return Object.keys(maps.accounts);
  if (list === 'categories') return Object.keys(maps.categories);
  return { categories: Object.keys(maps.categories), accounts: Object.keys(maps.accounts) };
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

const matchesCategory = (category, value) => String(category?.id ?? '') === value;

const matchesAccount = (account, value) =>
  String(account?.accountKey ?? '').trim().toLowerCase() === value.toLowerCase();

/**
 * Validates one quick-add transaction against the user's own categories and
 * accounts. Both lists are the caller's, so an id that belongs to somebody else
 * fails here rather than reaching the database.
 */
export const validateAutomationTransaction = (body, { categories = [], accounts = [] } = {}) => {
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
    account = findByIdOrLabel(rawAccount, accounts, options.accounts, matchesAccount);
    if (!account) {
      return { ok: false, status: 400, code: 'INVALID_ACCOUNT', error: 'невідомий рахунок' };
    }
  }

  // An unsupported code is refused instead of being folded into UAH: a typo in
  // a shortcut is typed once and then repeated on every run, so a silent
  // fallback would keep booking zloty as hryvnia for weeks.
  const rawCurrency = String(body?.currency ?? '').trim().toUpperCase();
  if (rawCurrency && !DENOMINATIONS.includes(rawCurrency)) {
    return { ok: false, status: 400, code: 'INVALID_CURRENCY', error: `валюта має бути однією з ${DENOMINATIONS.join(', ')}` };
  }
  // Unstated currency follows the chosen account, so a quick add never needs a
  // currency picker and a crypto account is not charged in hryvnia.
  const currency = rawCurrency
    ? normalizeDenomination(rawCurrency)
    : normalizeDenomination(account?.primaryCurrency);

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
 */
export const buildResultMessage = ({ type, amount, currency, categoryName, accountName }) => {
  const head = type === 'income' ? '✅ Дохід' : '✅ Витрата';
  return [`${head} ${formatAmount(amount, currency)} ${currency}`, categoryName, accountName]
    .filter(Boolean)
    .join(' · ');
};
