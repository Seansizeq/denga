/**
 * Картка операції, що вже записана.
 *
 * Тут важлива відмінність від картки розумного додавання
 * (`smart-transaction-message.js`): та питає дозволу **до** запису, ця
 * приходить **після**. Причина не в зручності, а в тому, що джерело інше.
 * Текст у чат пише людина й одразу дивиться на відповідь; вебхук банку
 * спрацьовує, коли телефон у кишені, а Telegram відкриють увечері. Якби запис
 * чекав на дотик, забута картка означала б діру в обліку — саме те, від чого
 * цю автоматизацію й заводять.
 *
 * Тому кнопки тут не «зберегти чи ні», а «виправити або прибрати». І головне:
 * виправлена категорія **запамʼятовується** для цього торговця, тож кожен
 * магазин питає про себе один раз.
 *
 * Дані кнопки Telegram обмежує 64 байтами, і id транзакції — uuid на 36
 * символів — разом з id категорії (а вона буває `custom:%D0%9A...|Coffee|%237C5CFF`)
 * у цю межу не влазить. Тому картка має власний короткий id, а категорія
 * передається номером у списку, збереженому разом із карткою.
 */
import { formatSmartAmount } from './smart-transaction-message.js';

const CALLBACK_PREFIX = 'bk';

/** Довжина власного id картки. 10 символів base36 — 36^10 варіантів. */
const CARD_ID_LENGTH = 10;

/**
 * Скільки категорій показуємо в пікері.
 *
 * Стеля не від Telegram (там дозволено значно більше), а від екрана: список
 * на сорок рядків гортати довше, ніж відкрити застосунок і виправити там.
 */
export const BANK_CARD_CATEGORY_LIMIT = 24;

export const createBankCardId = (random = Math.random) =>
  Array.from({ length: CARD_ID_LENGTH }, () => Math.floor(random() * 36).toString(36)).join('');

const ACTIONS = {
  /** Показати пікер категорій. */
  categories: 'c',
  /** Обрати категорію за номером. */
  pick: 'p',
  /** Видалити записану операцію. */
  drop: 'd',
  /** Згорнути пікер, лишивши як є. */
  keep: 'k',
};

export const bankCallbackData = (action, cardId, index = null) =>
  [CALLBACK_PREFIX, ACTIONS[action] ?? action, cardId, index === null ? null : String(index)]
    .filter((part) => part !== null)
    .join(':');

/**
 * @returns {{ action: 'categories'|'pick'|'drop'|'keep', cardId: string, index: number|null } | null}
 */
export const parseBankCallback = (data) => {
  const parts = String(data ?? '').split(':');
  if (parts[0] !== CALLBACK_PREFIX || parts.length < 3) return null;
  const action = Object.keys(ACTIONS).find((name) => ACTIONS[name] === parts[1]);
  const cardId = String(parts[2] ?? '').trim();
  if (!action || !cardId) return null;
  const index = parts.length > 3 ? Number.parseInt(parts[3], 10) : null;
  if (parts.length > 3 && !Number.isInteger(index)) return null;
  return { action, cardId, index };
};

const SOURCE_HINT = {
  // Категорію взято з правила, якому навчила сама людина, — мовчимо, бо це
  // вже її рішення, а не здогад.
  rule: '',
  mcc: 'категорію вгадано за типом закладу',
  fallback: 'категорію не вгадано',
};

/**
 * Один рядок опису плюс підказка, якщо категорія — здогад.
 *
 * Сума без знака: напрямок уже сказаний словом, а мінус перед числом на
 * картці витрати читається як «мінус ще раз».
 */
export const buildBankCardText = ({
  merchant,
  amount,
  currency,
  categoryName,
  accountName = '',
  type = 'expense',
  source = 'fallback',
} = {}) => {
  const head = type === 'income' ? '💰 Надходження' : '💳 Витрата';
  const title = String(merchant ?? '').trim();
  const hint = SOURCE_HINT[source] ?? '';
  return [
    `${head} · ${formatSmartAmount(amount, currency)}`,
    [title, categoryName, accountName].filter(Boolean).join(' · '),
    hint ? `↪️ ${hint}` : '',
  ]
    .filter(Boolean)
    .join('\n');
};

export const buildBankCardKeyboard = (cardId) => ({
  inline_keyboard: [
    [
      { text: '🏷 Категорія', callback_data: bankCallbackData('categories', cardId) },
      { text: '🗑 Видалити', callback_data: bankCallbackData('drop', cardId) },
    ],
  ],
});

/**
 * Пікер категорій.
 *
 * По дві в рядок: назви категорій короткі, а вдвічі нижчий список менше
 * відтісняє попереднє листування вгору.
 */
export const buildBankCategoryKeyboard = (cardId, categories) => {
  const rows = [];
  const names = categories.slice(0, BANK_CARD_CATEGORY_LIMIT);
  for (let i = 0; i < names.length; i += 2) {
    rows.push(
      names.slice(i, i + 2).map((category, offset) => ({
        text: String(category?.name ?? category?.id ?? '—').slice(0, 32),
        callback_data: bankCallbackData('pick', cardId, i + offset),
      })),
    );
  }
  rows.push([{ text: '← Лишити як є', callback_data: bankCallbackData('keep', cardId) }]);
  return { inline_keyboard: rows };
};

/** Текст, на який картка замінюється після дії — щоб у чаті лишився підсумок. */
export const buildBankCardResult = ({ merchant, amount, currency, categoryName, accountName, dropped = false } = {}) => {
  if (dropped) {
    return `🗑 Прибрано: ${[String(merchant ?? '').trim(), formatSmartAmount(amount, currency)].filter(Boolean).join(' · ')}`;
  }
  return `✅ ${[String(merchant ?? '').trim(), formatSmartAmount(amount, currency), categoryName, accountName].filter(Boolean).join(' · ')}`;
};
