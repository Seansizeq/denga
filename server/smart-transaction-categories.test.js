import { describe, expect, it } from 'vitest';
import { CATEGORIES as APP_CATEGORIES } from '../src/constants/categories.ts';
import { preferExplicitCategory } from './smart-transaction-shared.js';
import {
  BOT_TRANSACTION_CATEGORIES,
  buildSmartTransactionCategories,
  inferSmartCategoryAliases,
} from './smart-transaction-categories.js';

const genericExpense = {
  isTransaction: true,
  categoryId: 'other_expense',
  categoryName: 'Інше',
  type: 'expense',
};
const genericIncome = {
  isTransaction: true,
  categoryId: 'other_income',
  categoryName: 'Інший дохід',
  type: 'income',
};

describe('Telegram smart transaction category catalog', () => {
  it('stays synchronized with every regular income/expense category in the Mini App', () => {
    const appIds = APP_CATEGORIES
      .filter((category) => (category.type === 'income' || category.type === 'expense') && category.id !== 'balance_correction')
      .map((category) => category.id)
      .sort();
    expect(BOT_TRANSACTION_CATEGORIES.map((category) => category.id).sort()).toEqual(appIds);
  });

  it.each([
    ['їжа', 'food'],
    ['такси', 'transport'],
    ['аренда', 'home'],
    ['кино', 'entertainment'],
    ['аптека', 'health'],
  ])('maps explicit expense alias "%s" to %s', (text, categoryId) => {
    expect(preferExplicitCategory(genericExpense, {
      text: `1200 ${text}`,
      categories: BOT_TRANSACTION_CATEGORIES,
    })).toMatchObject({ categoryId });
  });

  it.each([
    ['зарплата', 'salary'],
    ['вернули долг', 'debt_return'],
    ['cashback', 'other_income'],
  ])('maps explicit income alias "%s" to %s', (text, categoryId) => {
    expect(preferExplicitCategory(genericIncome, {
      text: `отримав ${text}`,
      categories: BOT_TRANSACTION_CATEGORIES,
    })).toMatchObject({ categoryId });
  });

  it.each([
    ['Одяг', 'одежда'],
    ['Підписки', 'подписки'],
    ['Подарунки', 'подарки'],
    ['Покупки', 'shopping'],
    ['Освіта', 'образование'],
    ['Благодійність', 'charity'],
    ['Техніка', 'электроника'],
    ['Переказ', 'перевод'],
    ['Sale', 'продажа'],
  ])('infers multilingual aliases for legacy category %s', (name, alias) => {
    expect(inferSmartCategoryAliases(name)).toContain(alias);
  });

  it('merges stored and legacy custom categories and preserves both transaction types', () => {
    const clothingId = 'custom:%D0%9E%D0%B4%D1%8F%D0%B3|Tag|%238E8E93';
    const giftId = 'custom:%D0%9F%D0%BE%D0%B4%D0%B0%D1%80%D1%83%D0%BD%D0%BA%D0%B8|Tag|%238E8E93';
    const categories = buildSmartTransactionCategories({
      includeOther: true,
      storedCategories: [{ id: clothingId, name: 'Одяг', type: 'expense' }],
      legacyCategories: [
        { id: clothingId, type: 'expense' },
        { id: giftId, type: 'expense' },
        { id: giftId, type: 'income' },
      ],
    });

    expect(categories.filter((category) => category.id === clothingId)).toHaveLength(1);
    expect(categories.find((category) => category.id === clothingId)).toMatchObject({
      name: 'Одяг',
      type: 'expense',
      aliases: expect.arrayContaining(['одежда', 'clothing']),
    });
    expect(categories.find((category) => category.id === giftId)).toMatchObject({
      name: 'Подарунки',
      type: 'any',
      aliases: expect.arrayContaining(['подарки', 'gifts']),
    });
  });
});
