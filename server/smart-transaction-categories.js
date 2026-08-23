// Canonical category catalog for Telegram smart transactions. Custom
// categories are merged from both the current table and legacy transaction IDs
// because older app versions stored them only inside transactions.

export const BOT_TRANSACTION_CATEGORIES = [
  {
    id: 'food', name: 'Продукти', type: 'expense',
    aliases: ['продукти', 'продукты', 'їжа', 'еда', 'кафе', 'ресторан', 'groceries', 'food', 'jedzenie', 'spożywcze'],
  },
  {
    id: 'transport', name: 'Транспорт', type: 'expense',
    aliases: ['транспорт', 'таксі', 'такси', 'taxi', 'uber', 'bolt', 'автобус', 'метро', 'поїзд', 'поезд', 'паливо', 'бензин', 'fuel', 'transport'],
  },
  {
    id: 'home', name: 'Житло', type: 'expense',
    aliases: ['житло', 'жилье', 'дім', 'дом', 'квартира', 'оренда', 'аренда', 'rent', 'комуналка', 'коммуналка', 'utilities', 'housing'],
  },
  {
    id: 'entertainment', name: 'Розваги', type: 'expense',
    aliases: ['розваги', 'развлечения', 'кіно', 'кино', 'ігри', 'игры', 'концерт', 'клуб', 'entertainment', 'cinema', 'games'],
  },
  {
    id: 'health', name: 'Здоров\'я', type: 'expense',
    aliases: ['здоров\'я', 'здоровье', 'аптека', 'ліки', 'лекарства', 'лікар', 'врач', 'стоматолог', 'health', 'doctor', 'pharmacy'],
  },
  {
    id: 'salary', name: 'Зарплата', type: 'income',
    aliases: ['зарплата', 'зп', 'аванс', 'премія', 'премия', 'salary', 'wage', 'виплата', 'выплата', 'wypłata'],
  },
  {
    id: 'debt_return', name: 'Повернення боргу', type: 'income',
    aliases: ['повернення боргу', 'повернули борг', 'возврат долга', 'вернули долг', 'debt return', 'debt repayment'],
  },
  {
    id: 'other_income', name: 'Інший дохід', type: 'income',
    aliases: ['інший дохід', 'другой доход', 'other income', 'кешбек', 'кэшбек', 'cashback', 'refund'],
  },
  { id: 'other_expense', name: 'Інше', type: 'expense', aliases: [] },
];

const CUSTOM_CATEGORY_PREFIX = 'custom:';

const normalize = (value) => String(value ?? '')
  .toLocaleLowerCase('uk-UA')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const CUSTOM_ALIAS_GROUPS = [
  {
    markers: ['одяг', 'одеж', 'cloth'],
    aliases: ['одяг', 'одежда', 'одежду', 'одежды', 'clothing', 'clothes', 'wear', 'odzież', 'ubrania'],
  },
  {
    markers: ['підпис', 'подпис', 'subscription'],
    aliases: ['підписка', 'підписки', 'подписка', 'подписки', 'subscription', 'subscriptions', 'subskrypcja', 'subskrypcje'],
  },
  {
    markers: ['подар', 'gift', 'present'],
    aliases: ['подарунок', 'подарунки', 'подарок', 'подарки', 'gift', 'gifts', 'present', 'prezent', 'prezenty'],
  },
  {
    markers: ['покуп', 'shopping', 'zakup'],
    aliases: ['покупка', 'покупки', 'покупка', 'покупки', 'shopping', 'zakupy'],
  },
  {
    markers: ['освіт', 'образован', 'educat'],
    aliases: ['освіта', 'навчання', 'образование', 'обучение', 'education', 'course', 'courses', 'edukacja', 'kurs'],
  },
  {
    markers: ['благод', 'благотвор', 'charity', 'donat'],
    aliases: ['благодійність', 'благотворительность', 'донат', 'пожертва', 'charity', 'donation', 'darowizna'],
  },
  {
    markers: ['технік', 'техник', 'electron', 'gadget'],
    aliases: ['техніка', 'техника', 'електроніка', 'электроника', 'electronics', 'gadgets', 'elektronika', 'sprzęt'],
  },
  {
    markers: ['переказ', 'перевод', 'transfer', 'przelew'],
    aliases: ['переказ', 'перевод', 'transfer', 'przelew'],
  },
  {
    markers: ['sale', 'продаж'],
    aliases: ['sale', 'продаж', 'продажа', 'продав', 'sold', 'sprzedaż'],
  },
];

export const inferSmartCategoryAliases = (name) => {
  const normalized = normalize(name);
  const aliases = new Set();
  if (normalized) aliases.add(normalized);
  for (const group of CUSTOM_ALIAS_GROUPS) {
    if (group.markers.some((marker) => normalized.includes(marker))) {
      for (const alias of group.aliases) aliases.add(alias);
    }
  }
  return Array.from(aliases);
};

export const parseSmartCustomCategoryId = (id) => {
  if (typeof id !== 'string' || !id.startsWith(CUSTOM_CATEGORY_PREFIX)) return null;
  const [encodedName] = id.slice(CUSTOM_CATEGORY_PREFIX.length).split('|');
  if (!encodedName) return null;
  try {
    const name = decodeURIComponent(encodedName).trim();
    return name ? { id, name } : null;
  } catch {
    return null;
  }
};

const normalizeType = (value) => value === 'income' ? 'income' : value === 'expense' ? 'expense' : 'any';

const mergeType = (left, right) => {
  if (!left) return right;
  if (!right || left === right) return left;
  return 'any';
};

export const buildSmartTransactionCategories = ({
  includeOther = false,
  storedCategories = [],
  legacyCategories = [],
} = {}) => {
  const standard = BOT_TRANSACTION_CATEGORIES.filter((category) =>
    includeOther || (category.id !== 'other_expense' && category.id !== 'other_income')
  ).map((category) => ({ ...category, aliases: [...category.aliases] }));
  const byId = new Map(standard.map((category) => [category.id, category]));

  const addCustom = (row, preferStoredName = false) => {
    const id = String(row?.id ?? row?.categoryId ?? '');
    const parsed = parseSmartCustomCategoryId(id);
    if (!parsed) return;
    const name = String(row?.name ?? parsed.name).trim() || parsed.name;
    const type = normalizeType(row?.type);
    const existing = byId.get(id);
    if (existing) {
      existing.type = mergeType(existing.type, type);
      if (preferStoredName && name) existing.name = name;
      existing.aliases = inferSmartCategoryAliases(existing.name);
      return;
    }
    byId.set(id, {
      id,
      name,
      type,
      aliases: inferSmartCategoryAliases(name),
    });
  };

  for (const row of legacyCategories) addCustom(row, false);
  for (const row of storedCategories) addCustom(row, true);
  return Array.from(byId.values());
};

