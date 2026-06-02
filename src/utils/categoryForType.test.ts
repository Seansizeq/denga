import { describe, expect, it } from 'vitest';
import {
  defaultCategoryForType,
  isCategoryValidForType,
  resolveCategoryForTypeChange,
} from './categoryForType';

describe('categoryForType', () => {
  it('returns defaults per transaction type', () => {
    expect(defaultCategoryForType('expense')).toBe('food');
    expect(defaultCategoryForType('income')).toBe('salary');
    expect(defaultCategoryForType('transfer')).toBe('transfer');
  });

  it('validates built-in categories for type', () => {
    expect(isCategoryValidForType('food', 'expense', [])).toBe(true);
    expect(isCategoryValidForType('food', 'income', [])).toBe(false);
    expect(isCategoryValidForType('custom:abc', 'expense', ['custom:abc'])).toBe(true);
  });

  it('keeps category when switching type if still valid', () => {
    expect(resolveCategoryForTypeChange('salary', 'income', [])).toBe('salary');
    expect(resolveCategoryForTypeChange('food', 'income', [])).toBe('salary');
    expect(resolveCategoryForTypeChange('food', 'transfer', [])).toBe('transfer');
    expect(resolveCategoryForTypeChange('salary', 'expense', [])).toBe('food');
  });
});
