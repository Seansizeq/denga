const CURRENCY_SYMBOLS = {
  UAH: '₴',
  PLN: 'zł',
  USD: '$',
};

const UKRAINIAN_MONTHS = [
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
];

const isIsoDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''));

const shiftIsoDay = (day, delta) => {
  if (!isIsoDay(day)) return '';
  const date = new Date(`${day}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
};

const capitalize = (value) => {
  const text = String(value ?? '').trim();
  return text ? `${text[0].toLocaleUpperCase('uk-UA')}${text.slice(1)}` : '';
};

export const formatSmartAmount = (amount, currency) => {
  const value = Number(amount);
  const formatted = Number.isFinite(value)
    ? new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(value)
    : String(amount ?? '').trim();
  const code = String(currency ?? '').trim().toUpperCase();
  return `${formatted} ${CURRENCY_SYMBOLS[code] || code}`.trim();
};

export const formatSmartDate = (day, today) => {
  const value = String(day ?? '').trim();
  const reference = String(today ?? '').trim();
  if (!isIsoDay(value)) return value;
  if (value === reference) return 'Сьогодні';
  if (value === shiftIsoDay(reference, -1)) return 'Вчора';

  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const date = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(date)) return value;
  const monthName = UKRAINIAN_MONTHS[month - 1];
  if (!monthName) return value;
  return yearRaw === reference.slice(0, 4)
    ? `${date} ${monthName}`
    : `${date} ${monthName} ${year}`;
};

export const buildSmartConfirmationMessage = (transaction, { today } = {}) => {
  const lines = [
    `${formatSmartAmount(transaction.amount, transaction.currency)} · ${transaction.type === 'income' ? 'Дохід' : 'Витрата'}`,
  ];
  const category = String(transaction.categoryName ?? transaction.categoryId ?? '').trim();
  const account = String(transaction.accountName ?? '').trim();
  if (category || account) lines.push([category, account].filter(Boolean).join(' · '));
  const note = capitalize(transaction.note);
  if (note) lines.push(note);
  const date = formatSmartDate(transaction.date, today);
  if (date) lines.push(date);
  return lines.join('\n');
};

const withPremiumEmoji = (text, customEmojiId, fallbackEmoji) => {
  const id = String(customEmojiId ?? '').trim();
  if (!/^\d+$/.test(id)) return { text, entities: [] };
  return {
    text: `${fallbackEmoji} ${text}`,
    entities: [{
      type: 'custom_emoji',
      offset: 0,
      length: fallbackEmoji.length,
      custom_emoji_id: id,
    }],
  };
};

export const buildSmartConfirmationPayload = (transaction, { today, emojiIds = {} } = {}) => {
  const type = transaction.type === 'income' ? 'income' : 'expense';
  const fallbackEmoji = type === 'income' ? '💰' : '💸';
  return withPremiumEmoji(
    buildSmartConfirmationMessage(transaction, { today }),
    emojiIds[type],
    fallbackEmoji,
  );
};

export const buildSmartSavedMessage = (transaction) => {
  const category = String(transaction.categoryName ?? transaction.categoryId ?? '').trim();
  return `✅ ${formatSmartAmount(transaction.amount, transaction.currency)} · ${category} — збережено`;
};

export const buildSmartSavedPayload = (transaction, { emojiIds = {} } = {}) => {
  const text = buildSmartSavedMessage(transaction);
  const id = String(emojiIds.save ?? '').trim();
  if (!/^\d+$/.test(id)) return { text, entities: [] };
  return {
    text,
    entities: [{
      type: 'custom_emoji',
      offset: 0,
      length: '✅'.length,
      custom_emoji_id: id,
    }],
  };
};

const premiumButton = (label, fallbackEmoji, customEmojiId, callbackData) => {
  const id = String(customEmojiId ?? '').trim();
  return /^\d+$/.test(id)
    ? { text: label, icon_custom_emoji_id: id, callback_data: callbackData }
    : { text: `${fallbackEmoji}${fallbackEmoji ? ' ' : ''}${label}`, callback_data: callbackData };
};

export const buildSmartTransactionKeyboard = (emojiIds = {}) => ({
  inline_keyboard: [
    [
      premiumButton('Зберегти', '✅', emojiIds.save, 'smart_save'),
      premiumButton('Змінити', '✏️', emojiIds.edit, 'smart_edit'),
    ],
    [premiumButton('Скасувати', '', emojiIds.cancel, 'smart_cancel')],
  ],
});
