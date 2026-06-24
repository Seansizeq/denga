import { CATEGORIES } from '../constants/categories';
import type { TransactionType } from '../types';

export function defaultCategoryForType(type: TransactionType): string {
  if (type === 'income') return 'salary';
  if (type === 'transfer') return 'transfer';
  return 'food';
}

export function isCategoryValidForType(
  categoryId: string,
  type: 'income' | 'expense',
  customCategoryIds: string[],
): boolean {
  const builtIn = CATEGORIES.find((c) => c.id === categoryId);
  if (builtIn) return builtIn.type === type || builtIn.type === 'both';
  return customCategoryIds.includes(categoryId);
}

export function resolveCategoryForTypeChange(
  currentCategoryId: string,
  newType: TransactionType,
  customCategoryIds: string[],
): string {
  if (newType === 'transfer') return 'transfer';
  const builtIn = CATEGORIES.find((c) => c.id === currentCategoryId);
  if (builtIn && builtIn.type === newType) return currentCategoryId;
  if (isCategoryValidForType(currentCategoryId, newType, customCategoryIds)) {
    return currentCategoryId;
  }
  return defaultCategoryForType(newType);
}
