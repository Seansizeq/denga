import type { CategoryKey } from '../i18n/translations';

export interface CategoryDef {
  id: CategoryKey;
  icon: string;
  color: string;
  type: 'income' | 'expense' | 'transfer';
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'food', icon: 'Utensils', color: '#FF9F0A', type: 'expense' },
  { id: 'transport', icon: 'Car', color: '#0A84FF', type: 'expense' },
  { id: 'home', icon: 'Home', color: '#5E5CE6', type: 'expense' },
  { id: 'entertainment', icon: 'Gamepad2', color: '#AF52DE', type: 'expense' },
  { id: 'health', icon: 'Pill', color: '#FF2D55', type: 'expense' },
  { id: 'other_expense', icon: 'Receipt', color: '#8E8E93', type: 'expense' },
  { id: 'transfer', icon: 'ArrowRightLeft', color: '#5AC8FA', type: 'transfer' },

  { id: 'salary', icon: 'Wallet', color: '#32D74B', type: 'income' },
  { id: 'other_income', icon: 'Coins', color: '#30B0C7', type: 'income' },
  { id: 'debt_return', icon: 'HandCoins', color: '#ff8a8a', type: 'income' },
];

const CUSTOM_CATEGORY_PREFIX = 'custom:';
const CUSTOM_CATEGORY_SEPARATOR = '|';

export const CUSTOM_CATEGORY_ICONS = [
  'Tag',
  'ShoppingBag',
  'ShoppingCart',
  'Utensils',
  'Pizza',
  'Sandwich',
  'Car',
  'Bus',
  'Bike',
  'Fuel',
  'Home',
  'Building2',
  'Wrench',
  'Coffee',
  'Gamepad2',
  'Film',
  'Music2',
  'Heart',
  'Briefcase',
  'Wallet',
  'Banknote',
  'BadgeDollarSign',
  'Coins',
  'HandCoins',
  'PiggyBank',
  'Landmark',
  'TrendingUp',
  'Gift',
  'Book',
  'Plane',
  'GraduationCap',
  'Dumbbell',
  'Pill',
  'Dog',
  'Shirt',
  'Smartphone',
  'Laptop',
  'Wifi',
  'Receipt',
  'Hammer',
] as const;

export type CustomCategoryIcon = typeof CUSTOM_CATEGORY_ICONS[number];

export interface CustomCategoryData {
  name: string;
  icon: CustomCategoryIcon;
  color: string;
}

const CUSTOM_CATEGORY_ICON_RULES: Array<{ icon: CustomCategoryIcon; keywords: string[] }> = [
  { icon: 'Shirt', keywords: ['cloth', 'одяг', 'одеж', 'wear'] },
  { icon: 'Receipt', keywords: ['balance', 'корекц', 'correction', 'adjust'] },
  { icon: 'Gift', keywords: ['gift', 'подар', 'present'] },
  { icon: 'ShoppingBag', keywords: ['shop', 'store', 'покуп', 'маркет'] },
  { icon: 'Gamepad2', keywords: ['game', 'ігри', 'игр'] },
  { icon: 'Tag', keywords: ['uncategor', 'без катег', 'проч'] },
  { icon: 'Wifi', keywords: ['icloud', 'cloud', 'хмар'] },
  { icon: 'Music2', keywords: ['spotify', 'music', 'муз'] },
  { icon: 'GraduationCap', keywords: ['education', 'освіт', 'образ'] },
  { icon: 'Wifi', keywords: ['google one', 'internet', 'wifi', 'інтернет'] },
  { icon: 'Smartphone', keywords: ['mobile', 'phone', 'телефон'] },
  { icon: 'HandCoins', keywords: ['charity', 'donat', 'благод', 'help'] },
  { icon: 'Laptop', keywords: ['digital', 'software', 'app', 'online'] },
];

const CUSTOM_CATEGORY_COLOR_RULES: Array<{ color: string; keywords: string[] }> = [
  { color: '#FF9F0A', keywords: ['cloth', 'одяг', 'одеж', 'wear', 'shop', 'store', 'покуп', 'маркет'] },
  { color: '#5E5CE6', keywords: ['spotify', 'music', 'муз', 'icloud', 'cloud', 'хмар'] },
  { color: '#AF52DE', keywords: ['game', 'ігри', 'игр', 'digital', 'software', 'app', 'online'] },
  { color: '#FFD53B', keywords: ['gift', 'подар', 'present', 'charity', 'donat', 'благод', 'help'] },
  { color: '#0A84FF', keywords: ['google one', 'internet', 'wifi', 'інтернет', 'mobile', 'phone', 'телефон'] },
  { color: '#32D74B', keywords: ['education', 'освіт', 'образ', 'balance', 'корекц', 'correction', 'adjust'] },
];

const normalizeCategoryName = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ');

export const CUSTOM_CATEGORY_COLORS = [
  '#FF9F0A',
  '#0A84FF',
  '#5E5CE6',
  '#AF52DE',
  '#FF2D55',
  '#32D74B',
  '#30B0C7',
  '#FFD53B',
  '#8E8E93',
] as const;

export const createCustomCategoryId = (
  name: string,
  icon: CustomCategoryIcon = 'Tag',
  color: string = '#8E8E93'
): string => {
  return `${CUSTOM_CATEGORY_PREFIX}${encodeURIComponent(name.trim())}${CUSTOM_CATEGORY_SEPARATOR}${icon}${CUSTOM_CATEGORY_SEPARATOR}${encodeURIComponent(color)}`;
};

export const getCustomCategoryData = (id: string): CustomCategoryData | null => {
  if (!id.startsWith(CUSTOM_CATEGORY_PREFIX)) return null;
  const raw = id.slice(CUSTOM_CATEGORY_PREFIX.length);
  if (!raw) return null;
  const [encoded, iconRaw, colorRaw] = raw.split(CUSTOM_CATEGORY_SEPARATOR);
  if (!encoded) return null;
  try {
    const decodedName = decodeURIComponent(encoded);
    const icon = CUSTOM_CATEGORY_ICONS.includes(iconRaw as CustomCategoryIcon)
      ? (iconRaw as CustomCategoryIcon)
      : 'Tag';
    const decodedColor = colorRaw ? decodeURIComponent(colorRaw) : '#8E8E93';
    const color = /^#([0-9A-Fa-f]{6})$/.test(decodedColor) ? decodedColor : '#8E8E93';
    return {
      name: decodedName,
      icon: inferCustomCategoryIcon(decodedName, icon),
      color: inferCustomCategoryColor(decodedName, color),
    };
  } catch {
    return {
      name: encoded,
      icon: inferCustomCategoryIcon(encoded, 'Tag'),
      color: inferCustomCategoryColor(encoded, '#8E8E93'),
    };
  }
};

export const getCustomCategoryName = (id: string): string | null => {
  return getCustomCategoryData(id)?.name ?? null;
};

export const inferCustomCategoryIcon = (name: string, currentIcon?: string): CustomCategoryIcon => {
  if (currentIcon && CUSTOM_CATEGORY_ICONS.includes(currentIcon as CustomCategoryIcon) && currentIcon !== 'Tag') {
    return currentIcon as CustomCategoryIcon;
  }
  const normalized = normalizeCategoryName(name);
  if (!normalized) return 'Tag';
  for (const rule of CUSTOM_CATEGORY_ICON_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.icon;
    }
  }
  return 'Tag';
};

const isHexColor = (value: string): boolean => /^#([0-9A-Fa-f]{6})$/.test(value);

const isDefaultGray = (value: string): boolean => value.toLocaleLowerCase() === '#8e8e93';

const NON_GRAY_CUSTOM_COLORS = CUSTOM_CATEGORY_COLORS.filter((color) => !isDefaultGray(color));

const pickColorByNameHash = (name: string): string => {
  const normalized = normalizeCategoryName(name);
  if (!normalized || NON_GRAY_CUSTOM_COLORS.length === 0) return '#5E5CE6';
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return NON_GRAY_CUSTOM_COLORS[hash % NON_GRAY_CUSTOM_COLORS.length];
};

export const inferCustomCategoryColor = (name: string, currentColor?: string): string => {
  if (currentColor && isHexColor(currentColor) && !isDefaultGray(currentColor)) {
    return currentColor;
  }
  const normalized = normalizeCategoryName(name);
  if (!normalized) return pickColorByNameHash(name);
  for (const rule of CUSTOM_CATEGORY_COLOR_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.color;
    }
  }
  return pickColorByNameHash(name);
};

export const findCategory = (id: string): CategoryDef => {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
};
