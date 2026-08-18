import { describe, expect, it } from 'vitest';
import {
  buildOptionsPayload,
  buildResultMessage,
  validateAutomationTransaction,
} from './automation-transaction.js';

const categories = [
  { id: 'food', name: 'Продукти', type: 'expense', emoji: '🍕' },
  { id: 'transport', name: 'Транспорт', type: 'expense', emoji: '🚗' },
  { id: 'salary', name: 'Зарплата', type: 'income', emoji: '💼' },
  { id: 'custom:x', name: 'Кава' , type: 'expense' },
];

const accounts = [
  { accountKey: 'santander', name: 'Santander', section: 'bank', primaryCurrency: 'PLN' },
  { accountKey: 'wallet', name: 'Готівка', section: 'cash', primaryCurrency: 'UAH' },
  { accountKey: 'usdt', name: 'USDT', section: 'crypto', primaryCurrency: 'USDT' },
];

describe('buildOptionsPayload', () => {
  it('maps label -> id so Shortcuts can pick over the keys', () => {
    const payload = buildOptionsPayload({ categories, accounts });
    expect(payload.categories['🍕 Продукти']).toBe('food');
    expect(payload.accounts['💳 Santander']).toBe('santander');
    expect(payload.accounts['💵 Готівка']).toBe('wallet');
  });

  it('offers expense categories by default, and the other types on request', () => {
    expect(Object.values(buildOptionsPayload({ categories, accounts }).categories)).not.toContain('salary');
    expect(Object.values(buildOptionsPayload({ categories, accounts, type: 'income' }).categories)).toEqual(['salary']);
    expect(Object.values(buildOptionsPayload({ categories, accounts, type: 'all' }).categories)).toContain('salary');
  });

  it('falls back to a generic emoji for a custom category', () => {
    expect(buildOptionsPayload({ categories, accounts }).categories['🏷 Кава']).toBe('custom:x');
  });

  it('keeps same-named accounts apart — a collapsed label would spend from the wrong one', () => {
    const payload = buildOptionsPayload({
      categories: [],
      accounts: [
        { accountKey: 'card_a', name: 'Картка', section: 'bank' },
        { accountKey: 'card_b', name: 'Картка', section: 'bank' },
      ],
    });
    expect(payload.accounts).toEqual({ '💳 Картка': 'card_a', '💳 Картка (2)': 'card_b' });
  });

  it('returns one map at the top level when a list is named', () => {
    expect(buildOptionsPayload({ categories, accounts, list: 'accounts' })).toEqual({
      '💳 Santander': 'santander',
      '💵 Готівка': 'wallet',
      '🪙 USDT': 'usdt',
    });
    expect(buildOptionsPayload({ categories, accounts, list: 'categories' })['🍕 Продукти']).toBe('food');
  });

  it('still filters by type when a single list is asked for', () => {
    expect(buildOptionsPayload({ categories, accounts, list: 'categories', type: 'income' })).toEqual({
      '💼 Зарплата': 'salary',
    });
  });

  it('keeps the envelope for an unknown list name', () => {
    expect(buildOptionsPayload({ categories, accounts, list: 'nope' })).toHaveProperty('categories');
  });

  it('skips rows without an id or key', () => {
    const payload = buildOptionsPayload({
      categories: [{ id: '  ', name: 'Ніщо', type: 'expense' }],
      accounts: [{ accountKey: '', name: 'Ніщо' }],
    });
    expect(payload).toEqual({ categories: {}, accounts: {} });
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
      validateAutomationTransaction({ amount: 55, categoryId: '🍕 Продукти', account: '💵 Готівка' }, ctx)
    ).toMatchObject({ ok: true, categoryId: 'food', account: 'wallet', currency: 'UAH' });
  });

  it('resolves a custom category and a crypto account by label too', () => {
    expect(
      validateAutomationTransaction({ amount: 1, categoryId: '🏷 Кава', account: '🪙 USDT' }, ctx)
    ).toMatchObject({ ok: true, categoryId: 'custom:x', account: 'usdt', currency: 'USDT' });
  });

  it('still refuses a label that belongs to no row', () => {
    expect(validateAutomationTransaction(valid({ categoryId: '🍕 Чужа' }), ctx)).toMatchObject({
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
