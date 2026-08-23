const CUSTOM_EMOJI_ID_PATTERN = /^\d+$/;

const SMART_TRANSACTION_EMOJI_ENV = {
  expense: 'TELEGRAM_EMOJI_EXPENSE_ID',
  income: 'TELEGRAM_EMOJI_INCOME_ID',
  save: 'TELEGRAM_EMOJI_SAVE_ID',
  edit: 'TELEGRAM_EMOJI_EDIT_ID',
  cancel: 'TELEGRAM_EMOJI_CANCEL_ID',
};
const normalizeCustomEmojiId = (value) => {
  const id = String(value ?? '').trim();
  return CUSTOM_EMOJI_ID_PATTERN.test(id) ? id : undefined;
};

export const readSmartTransactionEmojiIds = (environment = process.env) =>
  Object.fromEntries(
    Object.entries(SMART_TRANSACTION_EMOJI_ENV)
      .map(([key, envName]) => [key, normalizeCustomEmojiId(environment?.[envName])])
      .filter(([, id]) => Boolean(id)),
  );

const collectEntities = (message, textField, entitiesField) => {
  const text = String(message?.[textField] ?? '');
  const entities = Array.isArray(message?.[entitiesField]) ? message[entitiesField] : [];
  return entities
    .filter((entity) => entity?.type === 'custom_emoji' && normalizeCustomEmojiId(entity.custom_emoji_id))
    .map((entity) => ({
      emoji: text.slice(Number(entity.offset) || 0, (Number(entity.offset) || 0) + (Number(entity.length) || 0)),
      id: String(entity.custom_emoji_id),
    }));
};

export const extractCustomEmojiReferences = (message) => {
  const source = message?.reply_to_message ?? message;
  const references = [
    ...collectEntities(source, 'text', 'entities'),
    ...collectEntities(source, 'caption', 'caption_entities'),
  ];
  const seen = new Set();
  return references.filter(({ id }) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

export const formatSmartTransactionEmojiSetup = (references) => {
  const values = Array.isArray(references) ? references : [];
  if (values.length === 0) {
    return [
      'Преміум-емодзі не знайдено.',
      'Надішліть 5 вибраних преміум-емодзі одним повідомленням у порядку:',
      'витрата, дохід, зберегти, змінити, скасувати.',
      'Потім дайте відповідь на нього командою /emoji_ids.',
    ].join('\n');
  }

  const entries = Object.entries(SMART_TRANSACTION_EMOJI_ENV);
  const lines = values.map(({ emoji, id }, index) => {
    const envName = entries[index]?.[1];
    return envName ? `${envName}=${id}` : `${emoji || '✨'}=${id}`;
  });
  const header = values.length >= entries.length
    ? 'Готові налаштування (перші 5 емодзі):'
    : `Знайдено ${values.length} з 5 емодзі. ID:`;
  return [header, ...lines].join('\n');
};
