import type { CategoryKey } from '../i18n/translations';

export interface CategoryDef {
  id: CategoryKey;
  icon: string;
  color: string;
  type: 'income' | 'expense';
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'food', icon: 'ShoppingBag', color: '#FF9F0A', type: 'expense' },
  { id: 'transport', icon: 'Car', color: '#0A84FF', type: 'expense' },
  { id: 'home', icon: 'Home', color: '#5E5CE6', type: 'expense' },
  { id: 'entertainment', icon: 'Coffee', color: '#AF52DE', type: 'expense' },
  { id: 'health', icon: 'Heart', color: '#FF2D55', type: 'expense' },
  { id: 'other_expense', icon: 'MoreHorizontal', color: '#8E8E93', type: 'expense' },

  { id: 'salary', icon: 'TrendingUp', color: '#32D74B', type: 'income' },
  { id: 'other_income', icon: 'Plus', color: '#30B0C7', type: 'income' },
];

const CUSTOM_CATEGORY_PREFIX = 'custom:';

export const createCustomCategoryId = (name: string): string => {
  return `${CUSTOM_CATEGORY_PREFIX}${encodeURIComponent(name.trim())}`;
};

export const getCustomCategoryName = (id: string): string | null => {
  if (!id.startsWith(CUSTOM_CATEGORY_PREFIX)) return null;
  const encoded = id.slice(CUSTOM_CATEGORY_PREFIX.length);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
};

export const findCategory = (id: string): CategoryDef => {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
};
