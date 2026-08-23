// Provider-agnostic half of smart transaction parsing: the prompt, the response
// schema and the validation that turns raw model JSON into our transaction shape.
//
// It lives apart from any one provider for two reasons. Swapping the model must
// not mean rewriting the rules — the prompt and the validation ARE the feature,
// the API call is plumbing. And `normalizeResult` is the safety net that makes a
// weaker model merely less useful instead of dangerous, so it is the one piece
// that most needs tests; while it sat inside the Gemini module it could not be
// imported without pulling in the network call.

export const ALLOWED_CURRENCIES = ['UAH', 'PLN', 'USD'];

export const buildSystemPrompt = ({ categories, accounts = [], defaultCurrency = 'UAH', today }) => {
  const categoryLines = categories
    .map((c) => `- id="${c.id}" | "${c.name}" | ${c.type}`)
    .join('\n');
  const accountLines = accounts.length
    ? accounts.map((a) => `- key="${a.accountKey}" | "${a.name}"`).join('\n')
    : '(рахунків немає)';

  return [
    'Ти — асистент особистого фінансового трекера. Користувач пише вільним текстом, що він купив, витратив або отримав.',
    'Твоє завдання — розпізнати з повідомлення одну транзакцію та повернути її у структурованому вигляді.',
    `Сьогодні: ${today}.`,
    '',
    'Доступні категорії (обери category_id СТРОГО з цього списку):',
    categoryLines,
    '',
    'Доступні рахунки (account_key обирай лише якщо користувач явно згадав рахунок):',
    accountLines,
    '',
    'Правила:',
    '- is_transaction = false, якщо повідомлення не є записом витрати/доходу (питання, привітання, команда тощо).',
    '- type: "expense" для витрат, "income" для доходів (зарплата, продаж, повернення).',
    '- amount: додатне число без валюти.',
    `- currency: одна з ${ALLOWED_CURRENCIES.join(', ')}. Якщо валюту не вказано — "${defaultCurrency}". "грн"→UAH, "зл"/"zł"→PLN, "$"/"долар"→USD.`,
    `- date: дата операції у форматі YYYY-MM-DD. Якщо дату не вказано — "${today}". Відносні слова на кшталт "сьогодні", "вчора" або "позавчора" обчислюй від цієї дати.`,
    '- category_id: обери найдоречнішу категорію зі списку за змістом. Враховуй тип (для доходу — категорію доходу).',
    '- account_key: ключ рахунку зі списку, лише якщо явно згадано; інакше порожній рядок "".',
    '- note: короткий опис українською (1-4 слова, напр. "кава", "таксі", "продукти"). Без суми й валюти.',
  ].join('\n');
};

/**
 * Standard JSON Schema — the dialect llama.cpp, OpenAI and everyone else speaks.
 * Gemini wants its own spelling, so that provider converts; the neutral form is
 * what lives here.
 *
 * The `enum` on `category_id` is not decoration: with constrained decoding the
 * model physically cannot name a category that does not exist.
 */
export const buildResponseSchema = (categoryIds) => ({
  type: 'object',
  properties: {
    is_transaction: { type: 'boolean' },
    type: { type: 'string', enum: ['expense', 'income'] },
    amount: { type: 'number' },
    currency: { type: 'string', enum: ALLOWED_CURRENCIES },
    // Keep this a plain string for broad llama.cpp/LM Studio grammar support;
    // normalizeResult validates the exact ISO date before it reaches callers.
    date: { type: 'string' },
    category_id: { type: 'string', enum: categoryIds },
    account_key: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['is_transaction', 'type', 'amount', 'currency', 'date', 'category_id', 'note'],
});

const GEMINI_TYPES = {
  object: 'OBJECT',
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
  array: 'ARRAY',
};

/** Same schema in Gemini's spelling: uppercase type names, everything else identical. */
export const toGeminiSchema = (schema) => {
  if (!schema || typeof schema !== 'object') return schema;
  const out = { ...schema };
  if (typeof out.type === 'string') {
    const mapped = GEMINI_TYPES[out.type.toLowerCase()];
    // Throwing beats silently shipping a type Gemini will reject: the failure
    // then happens here, at the conversion, and not as an opaque HTTP 400.
    if (!mapped) throw new Error(`toGeminiSchema: unsupported type "${out.type}"`);
    out.type = mapped;
  }
  if (out.properties) {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([key, value]) => [key, toGeminiSchema(value)])
    );
  }
  if (out.items) out.items = toGeminiSchema(out.items);
  return out;
};

/**
 * Validate + normalize raw model JSON into our transaction shape.
 *
 * Everything a model can get wrong is checked against data it does not control:
 * the category must exist in the list we sent, the amount must be a positive
 * finite number, the currency must be one we support, the account key must match
 * one of the user's own. Anything else becomes `{ isTransaction: false }`, which
 * callers already treat as "ask the human" — so a bad guess costs a fallback to
 * the manual flow, never a wrong transaction written to the ledger.
 *
 * This is what makes a small local model an acceptable swap for a large hosted
 * one: it changes how often the feature helps, not how safe it is.
 */
export const normalizeResult = (
  parsed,
  { categories, accounts = [], defaultCurrency = 'UAH', today = new Date().toISOString().slice(0, 10) },
) => {
  if (!parsed || parsed.is_transaction !== true) return { isTransaction: false };

  const amount = Number(parsed.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { isTransaction: false };

  const category = categories.find((c) => c.id === parsed.category_id);
  if (!category) return { isTransaction: false };

  // The category's own type is authoritative when it is income/expense-specific.
  const type =
    category.type === 'income' || category.type === 'expense'
      ? category.type
      : parsed.type === 'income'
        ? 'income'
        : 'expense';

  const currency = ALLOWED_CURRENCIES.includes(String(parsed.currency).toUpperCase())
    ? String(parsed.currency).toUpperCase()
    : defaultCurrency;

  const rawDate = String(parsed.date ?? '').trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(Date.parse(`${rawDate}T00:00:00Z`))
    ? rawDate
    : today;

  let accountKey = null;
  let accountName = null;
  const rawKey = String(parsed.account_key || '').trim().toLowerCase();
  if (rawKey) {
    const account = accounts.find((a) => String(a.accountKey).toLowerCase() === rawKey);
    if (account) {
      accountKey = String(account.accountKey);
      accountName = account.name || account.accountKey;
    }
  }

  const note =
    typeof parsed.note === 'string' && parsed.note.trim()
      ? parsed.note.trim().slice(0, 60)
      : category.name;

  return {
    isTransaction: true,
    amount,
    currency,
    date,
    categoryId: category.id,
    categoryName: category.name,
    type,
    accountKey,
    accountName,
    note,
  };
};
