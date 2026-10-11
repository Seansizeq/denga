// Чого бракує операції з чату, перш ніж її можна зберегти, і що бот може
// заповнити сам.
//
// Правила ті самі, що й у застосунку (`src/utils/transactionCompleteness.ts`):
// рахунок потрібен, коли людині є з чого обрати, — будь-який рахунок, крім
// цілі, бо з цілі не платять; а «Інше» — не категорія, а заглушка, яку
// ставлять, коли не вгадали. Інакше бот зберігав би те, що застосунок одразу
// ж позначає помаранчевим «Заповніть рахунок / категорію».

/** У порядку гаманця: `sort_index` нумерується всередині розділу. */
const SECTION_ORDER = ['bank', 'cash', 'crypto', 'stocks', 'debt'];
const SECTION_EMOJI = { bank: '💳', cash: '💵', crypto: '🪙', stocks: '📈', debt: '🤝' };

export const PLACEHOLDER_CATEGORY_IDS = ['other_expense', 'other_income'];

/** Telegram витримує й більше, але довший список уже не прочитати в чаті. */
const MAX_OPTIONS = 40;

const sectionRank = (section) => {
  const index = SECTION_ORDER.indexOf(String(section ?? ''));
  return index === -1 ? SECTION_ORDER.length : index;
};

/**
 * Рахунки для кнопок, у порядку гаманця. Список записується разом із карткою,
 * а кнопки посилаються на номер у ньому: між показом і натисканням людина
 * могла завести новий рахунок, і свіжий список зсунув би номери.
 *
 * @param {Array<{ accountKey: string, name?: string, section?: string, sortIndex?: number, currency?: string }>} rows
 * @returns {Array<{ key: string, name: string, section: string, currency: string }>}
 */
export const buildSmartAccountOptions = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .filter((row) => String(row?.accountKey ?? '').trim() && String(row?.section ?? '') !== 'goal')
    .sort(
      (a, b) =>
        sectionRank(a.section) - sectionRank(b.section) || (Number(a.sortIndex) || 0) - (Number(b.sortIndex) || 0)
    )
    .slice(0, MAX_OPTIONS)
    .map((row) => ({
      key: String(row.accountKey).trim().toLowerCase(),
      name: String(row.name ?? '').trim() || String(row.accountKey).trim(),
      section: String(row.section ?? ''),
      currency: String(row.currency ?? '').trim().toUpperCase(),
    }));

/**
 * Категорії типу операції; «Інше» — останнім, бо його беруть, коли нічого
 * іншого не підійшло. Воно лишається в списку: без нього людина з покупкою,
 * для якої категорії ще не завела, не змогла б зберегти зовсім.
 *
 * @returns {Array<{ id: string, name: string }>}
 */
export const buildSmartCategoryOptions = (categories, type) => {
  const wanted = type === 'income' ? 'income' : 'expense';
  return (Array.isArray(categories) ? categories : [])
    .filter((category) => String(category?.id ?? '').trim() && category.type === wanted)
    .sort(
      (a, b) =>
        Number(PLACEHOLDER_CATEGORY_IDS.includes(a.id)) - Number(PLACEHOLDER_CATEGORY_IDS.includes(b.id))
    )
    .slice(0, MAX_OPTIONS)
    .map((category) => ({ id: String(category.id), name: String(category.name ?? '').trim() || String(category.id) }));
};

/**
 * Рахунок, який можна поставити без питання, — лише коли вибір очевидний:
 * одна картка чи готівка у валюті операції («булочка 36 zł» при одному
 * злотовому рахунку) або взагалі один рахунок. Із двох гривневих карток бот
 * не вгадує — він питає: тиха помилка в рахунку зсуває баланс, і помітять її
 * не одразу.
 *
 * @returns {{ key: string, name: string } | null}
 */
export const guessSmartAccount = (accountOptions, currency) => {
  const options = Array.isArray(accountOptions) ? accountOptions : [];
  const code = String(currency ?? '').trim().toUpperCase();
  const sameCurrency = options.filter(
    (option) => (option.section === 'bank' || option.section === 'cash') && option.currency === code
  );
  if (sameCurrency.length === 1) return sameCurrency[0];
  if (options.length === 1) return options[0];
  return null;
};

/**
 * Про що картка питає зараз: `'account'`, `'category'` або `null`, коли все
 * заповнено й можна зберігати.
 *
 * Питає лише тоді, коли є з чого обрати. Рахунок — першим: його бракує майже
 * завжди, а категорію модель здебільшого вгадує. «Інше», обране людиною
 * свідомо (`categoryConfirmed`), — уже відповідь, а не заглушка.
 */
export const nextSmartQuestion = (card) => {
  if (!card) return null;
  if (card.picking === 'account' || card.picking === 'category') return card.picking;
  const accounts = Array.isArray(card.accountOptions) ? card.accountOptions : [];
  const categories = Array.isArray(card.categoryOptions) ? card.categoryOptions : [];
  if (accounts.length > 0 && !card.accountKey) return 'account';
  const categoryId = String(card.categoryId ?? '').trim();
  if (
    categories.length > 0
    && !card.categoryConfirmed
    && (!categoryId || PLACEHOLDER_CATEGORY_IDS.includes(categoryId))
  ) {
    return 'category';
  }
  return null;
};

export const accountOptionLabel = (option) =>
  `${SECTION_EMOJI[option.section] ?? '💳'} ${String(option.name).slice(0, 28)}`;

/**
 * `smart_acc:<n>` / `smart_cat:<n>` — вибір із картки; `smart_pick:account|category`
 * — відкрити список на вже заповненій картці; `smart_back` — закрити його.
 */
export const parseSmartFillCallback = (data) => {
  const value = String(data ?? '');
  const choose = /^smart_(acc|cat):(\d{1,2})$/.exec(value);
  if (choose) return { action: 'choose', field: choose[1] === 'acc' ? 'account' : 'category', index: Number(choose[2]) };
  const open = /^smart_pick:(account|category)$/.exec(value);
  if (open) return { action: 'open', field: open[1] };
  if (value === 'smart_back') return { action: 'back' };
  return null;
};

/**
 * Картка після натискання. `null` — кнопка не з цієї картки (номер поза
 * списком, список порожній), і змінювати нічого не можна.
 */
export const applySmartFillChoice = (card, choice) => {
  if (!card || !choice) return null;
  if (choice.action === 'back') return { ...card, picking: null };
  const accounts = Array.isArray(card.accountOptions) ? card.accountOptions : [];
  const categories = Array.isArray(card.categoryOptions) ? card.categoryOptions : [];
  if (choice.action === 'open') {
    const options = choice.field === 'account' ? accounts : categories;
    return options.length > 0 ? { ...card, picking: choice.field } : null;
  }
  if (choice.field === 'account') {
    const option = accounts[choice.index];
    if (!option) return null;
    return { ...card, accountKey: option.key, accountName: option.name, picking: null };
  }
  const option = categories[choice.index];
  if (!option) return null;
  return { ...card, categoryId: option.id, categoryName: option.name, categoryConfirmed: true, picking: null };
};
