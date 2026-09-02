import { describe, expect, it } from 'vitest';
import {
  buildOptionMaps,
  buildOptionsPayload,
  buildResultMessage,
  validateAutomationTransaction,
} from './automation-transaction.js';

const categories = [
  { id: 'food', name: 'Продукти', type: 'expense' },
  { id: 'transport', name: 'Транспорт', type: 'expense' },
  { id: 'salary', name: 'Зарплата', type: 'income' },
  { id: 'custom:x', name: 'Кава' , type: 'expense' },
];

const accounts = [
  { accountKey: 'santander', name: 'Santander', section: 'bank', primaryCurrency: 'PLN' },
  { accountKey: 'wallet', name: 'Готівка', section: 'cash', primaryCurrency: 'UAH' },
  { accountKey: 'usdt', name: 'USDT', section: 'crypto', primaryCurrency: 'USDT' },
];

describe('buildOptionMaps', () => {
  it('maps label -> id so a picked row can be resolved back', () => {
    const maps = buildOptionMaps({ categories, accounts });
    expect(maps.categories['Продукти']).toBe('food');
    expect(maps.accounts['💳 Santander']).toBe('santander');
    expect(maps.accounts['💵 Готівка']).toBe('wallet');
  });
});

describe('buildOptionsPayload', () => {
  it('hands the picker an ordered array — a dictionary loses its order in Shortcuts', () => {
    expect(buildOptionsPayload({ categories, accounts, list: 'accounts' })).toEqual([
      '💳 Santander',
      '💵 Готівка',
      '🪙 USDT',
    ]);
    expect(buildOptionsPayload({ categories, accounts })).toEqual({
      categories: ['Продукти', 'Транспорт', 'Кава'],
      accounts: ['💳 Santander', '💵 Готівка', '🪙 USDT'],
    });
  });

  it('offers expense categories by default, and the other types on request', () => {
    expect(buildOptionsPayload({ categories, accounts }).categories).not.toContain('Зарплата');
    expect(buildOptionsPayload({ categories, accounts, type: 'income', list: 'categories' })).toEqual([
      'Зарплата',
    ]);
    expect(buildOptionsPayload({ categories, accounts, type: 'all' }).categories).toContain('Зарплата');
  });

  it('lists a custom category by its own name, like every other one', () => {
    expect(buildOptionMaps({ categories, accounts }).categories['Кава']).toBe('custom:x');
  });

  it('keeps same-named accounts apart — a collapsed label would spend from the wrong one', () => {
    const maps = buildOptionMaps({
      categories: [],
      accounts: [
        { accountKey: 'card_a', name: 'Картка', section: 'bank' },
        { accountKey: 'card_b', name: 'Картка', section: 'bank' },
      ],
    });
    expect(maps.accounts).toEqual({ '💳 Картка': 'card_a', '💳 Картка (2)': 'card_b' });
  });

  it('groups accounts the way the wallet does, not by a per-section index', () => {
    const mixed = [
      { accountKey: 'goal_1', name: 'Road to 30k', section: 'goal', sortIndex: 0 },
      { accountKey: 'usdt', name: 'USDT', section: 'crypto', sortIndex: 0 },
      { accountKey: 'misha', name: 'Misha', section: 'debt', sortIndex: 0 },
      { accountKey: 'privat', name: 'Приват24', section: 'bank', sortIndex: 1 },
      { accountKey: 'cash', name: 'Готівка', section: 'cash', sortIndex: 0 },
      { accountKey: 'katka', name: 'Катка24', section: 'bank', sortIndex: 0 },
    ];
    expect(Object.values(buildOptionMaps({ accounts: mixed }).accounts)).toEqual([
      'katka',
      'privat',
      'cash',
      'usdt',
      'misha',
      'goal_1',
    ]);
  });

  it('drops the catch-all category to the bottom, keeping the rest as given', () => {
    const withOther = [
      { id: 'food', name: 'Продукти', type: 'expense' },
      { id: 'other_expense', name: 'Інше', type: 'expense' },
      { id: 'custom:x', name: 'Кава', type: 'expense' },
    ];
    expect(Object.values(buildOptionMaps({ categories: withOther }).categories)).toEqual([
      'food',
      'custom:x',
      'other_expense',
    ]);
  });

  it('keeps the envelope for an unknown list name', () => {
    expect(buildOptionsPayload({ categories, accounts, list: 'nope' })).toHaveProperty('categories');
  });

  it('skips rows without an id or key', () => {
    const payload = buildOptionsPayload({
      categories: [{ id: '  ', name: 'Ніщо', type: 'expense' }],
      accounts: [{ accountKey: '', name: 'Ніщо' }],
    });
    expect(payload).toEqual({ categories: [], accounts: [] });
  });
});

describe('validateAutomationTransaction', () => {
  const valid = (over = {}) => ({ amount: 55, categoryId: 'food', account: 'wallet', ...over });
  const ctx = { categories, accounts };

  it('accepts a complete quick add', () => {
    expect(validateAutomationTransaction(valid(), ctx)).toMatchObject({
      ok: true,
      amount: 55,
      currency: 'UAH',
      categoryId: 'food',
      type: 'expense',
      account: 'wallet',
      accountName: 'Готівка',
    });
  });

  it('rejects a non-positive or unparseable amount', () => {
    expect(validateAutomationTransaction(valid({ amount: 0 }), ctx)).toMatchObject({ code: 'INVALID_AMOUNT' });
    expect(validateAutomationTransaction(valid({ amount: -1 }), ctx)).toMatchObject({ code: 'INVALID_AMOUNT' });
    expect(validateAutomationTransaction(valid({ amount: 'abc' }), ctx)).toMatchObject({ code: 'INVALID_AMOUNT' });
  });

  it("refuses ids that are not in the caller's own lists", () => {
    expect(validateAutomationTransaction(valid({ categoryId: 'nope' }), ctx)).toMatchObject({ code: 'INVALID_CATEGORY' });
    expect(validateAutomationTransaction(valid({ account: 'someone_else' }), ctx)).toMatchObject({ code: 'INVALID_ACCOUNT' });
  });

  it('accepts the picker label, so a shortcut can pass the chosen row straight through', () => {
    expect(
      validateAutomationTransaction({ amount: 55, categoryId: 'Продукти', account: '💵 Готівка' }, ctx)
    ).toMatchObject({ ok: true, categoryId: 'food', account: 'wallet', currency: 'UAH' });
  });

  it('resolves a custom category and a crypto account by label too', () => {
    expect(
      validateAutomationTransaction({ amount: 1, categoryId: 'Кава', account: '🪙 USDT' }, ctx)
    ).toMatchObject({ ok: true, categoryId: 'custom:x', account: 'usdt', currency: 'USDT' });
  });

  it('still refuses a label that belongs to no row', () => {
    expect(validateAutomationTransaction(valid({ categoryId: 'Чужа' }), ctx)).toMatchObject({
      code: 'INVALID_CATEGORY',
    });
    expect(validateAutomationTransaction(valid({ account: '💳 Чужий' }), ctx)).toMatchObject({
      code: 'INVALID_ACCOUNT',
    });
  });

  it('does not let an account label pass as a category', () => {
    expect(validateAutomationTransaction(valid({ categoryId: '💵 Готівка' }), ctx)).toMatchObject({
      code: 'INVALID_CATEGORY',
    });
  });

  it('takes the currency from the account when none is given', () => {
    expect(validateAutomationTransaction(valid({ account: 'santander' }), ctx)).toMatchObject({ currency: 'PLN' });
    expect(validateAutomationTransaction(valid({ account: 'usdt' }), ctx)).toMatchObject({ currency: 'USDT' });
    expect(validateAutomationTransaction(valid({ account: undefined }), ctx)).toMatchObject({ currency: 'UAH', account: null });
  });

  it('refuses an unsupported currency instead of folding it into UAH', () => {
    expect(validateAutomationTransaction(valid({ currency: 'EUR' }), ctx)).toMatchObject({ code: 'INVALID_CURRENCY' });
    expect(validateAutomationTransaction(valid({ currency: 'pln' }), ctx)).toMatchObject({ ok: true, currency: 'PLN' });
  });

  it('accepts an ISO operation date and rejects a malformed one', () => {
    expect(validateAutomationTransaction(valid({ date: '2026-08-22' }), ctx)).toMatchObject({
      ok: true,
      date: '2026-08-22',
    });
    expect(validateAutomationTransaction(valid({ date: '22.08.2026' }), ctx)).toMatchObject({
      code: 'INVALID_DATE',
    });
  });

  it('lets the category decide the type', () => {
    expect(validateAutomationTransaction(valid({ categoryId: 'salary', type: 'expense' }), ctx)).toMatchObject({
      type: 'income',
    });
  });

  it('caps the note and falls back to the category name', () => {
    expect(validateAutomationTransaction(valid({ note: '  ' }), ctx)).toMatchObject({ note: 'Продукти' });
    expect(validateAutomationTransaction(valid({ note: 'я'.repeat(80) }), ctx).note).toHaveLength(60);
  });
});

describe('buildResultMessage', () => {
  it('reads as one notification line', () => {
    expect(
      buildResultMessage({
        type: 'expense',
        amount: 55,
        currency: 'UAH',
        categoryName: 'Продукти',
        accountName: 'Готівка',
      })
    ).toBe('✅ Витрата 55 UAH · Продукти · Готівка');
  });

  it('drops the account when the transaction has none', () => {
    expect(
      buildResultMessage({ type: 'income', amount: 30000, currency: 'UAH', categoryName: 'Зарплата' })
    ).toBe('✅ Дохід 30000 UAH · Зарплата');
  });

  it('keeps crypto precision', () => {
    expect(
      buildResultMessage({ type: 'expense', amount: 0.00012345, currency: 'BTC', categoryName: 'Інше' })
    ).toBe('✅ Витрата 0.00012345 BTC · Інше');
  });
});
