import type { CategoryKey } from '../i18n/translations';

export interface CategoryDef {
  id: CategoryKey;
  icon: string;
  color: string;
  type: 'income' | 'expense';
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'food', icon: 'Utensils', color: '#FF9F0A', type: 'expense' },
  { id: 'transport', icon: 'Car', color: '#0A84FF', type: 'expense' },
  { id: 'home', icon: 'Home', color: '#5E5CE6', type: 'expense' },
  { id: 'entertainment', icon: 'Gamepad2', color: '#AF52DE', type: 'expense' },
  { id: 'health', icon: 'Pill', color: '#FF2D55', type: 'expense' },
  { id: 'other_expense', icon: 'Receipt', color: '#8E8E93', type: 'expense' },

  { id: 'salary', icon: 'Wallet', color: '#32D74B', type: 'income' },
  { id: 'other_income', icon: 'Coins', color: '#30B0C7', type: 'income' },
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
    return { name: decodedName, icon, color };
  } catch {
    return { name: encoded, icon: 'Tag', color: '#8E8E93' };
  }
};

export const getCustomCategoryName = (id: string): string | null => {
  return getCustomCategoryData(id)?.name ?? null;
};

export const findCategory = (id: string): CategoryDef => {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
};
