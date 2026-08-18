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
 * @param type 'expense' | 'income' | 'all' — which categories the picker offers.
 */
export const buildOptionsPayload = ({ categories = [], accounts = [], type = 'expense' } = {}) => {
  const wantedType = type === 'income' ? 'income' : type === 'all' ? null : 'expense';

  const categoryOptions = {};
  for (const category of categories) {
    const id = String(category?.id ?? '').trim();
    if (!id) continue;
    if (wantedType && category?.type !== wantedType) continue;
    const name = String(category?.name ?? '').trim() || id;
    putUnique(categoryOptions, label(category?.emoji || FALLBACK_CATEGORY_EMOJI, name), id);
  }

  const accountOptions = {};
  for (const account of accounts) {
    const key = String(account?.accountKey ?? '').trim().toLowerCase();
    if (!key) continue;
    const name = String(account?.name ?? '').trim() || key;
    const emoji = SECTION_EMOJI[String(account?.section ?? '')] ?? FALLBACK_ACCOUNT_EMOJI;
    putUnique(accountOptions, label(emoji, name), key);
  }

  return { categories: categoryOptions, accounts: accountOptions };
};

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

  const categoryId = String(body?.categoryId ?? '').trim();
  const category = categories.find((c) => String(c?.id ?? '') === categoryId);
  if (!category) {
    return { ok: false, status: 400, code: 'INVALID_CATEGORY', error: 'невідома категорія' };
  }

  const rawAccount = String(body?.account ?? body?.accountKey ?? '').trim().toLowerCase();
  let account = null;
  if (rawAccount) {
    account = accounts.find((a) => String(a?.accountKey ?? '').trim().toLowerCase() === rawAccount) ?? null;
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
