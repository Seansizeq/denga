import { describe, expect, it } from 'vitest';
import {
  buildResponseSchema,
  buildSystemPrompt,
  normalizeResult,
  preferExplicitCategory,
  toGeminiSchema,
} from './smart-transaction-shared.js';

const categories = [
  { id: 'cafe', name: 'Кафе', type: 'expense' },
  { id: 'salary', name: 'Зарплата', type: 'income' },
  { id: 'other', name: 'Інше', type: 'any' },
];
const accounts = [
  { accountKey: 'cash_uah', name: 'Готівка' },
  { accountKey: 'card_pko', name: 'Картка PKO' },
];
const ctx = { categories, accounts, defaultCurrency: 'UAH' };

const model = (overrides = {}) => ({
  is_transaction: true,
  type: 'expense',
  amount: 55,
  currency: 'UAH',
  date: '2026-08-23',
  category_id: 'cafe',
  account_key: '',
  note: 'кава',
  ...overrides,
});

describe('normalizeResult', () => {
  it('maps a well-formed answer onto our transaction shape', () => {
    expect(normalizeResult(model(), ctx)).toEqual({
      isTransaction: true,
      amount: 55,
      currency: 'UAH',
      date: '2026-08-23',
      categoryId: 'cafe',
      categoryName: 'Кафе',
      type: 'expense',
      accountKey: null,
      accountName: null,
      note: 'кава',
    });
  });

  it('refuses anything the model did not mark as a transaction', () => {
    expect(normalizeResult(model({ is_transaction: false }), ctx)).toEqual({ isTransaction: false });
    expect(normalizeResult(null, ctx)).toEqual({ isTransaction: false });
    expect(normalizeResult(undefined, ctx)).toEqual({ isTransaction: false });
  });

  /**
   * Головне, заради чого ця функція існує окремо від провайдера: усе, що модель
   * може вигадати, звіряється з даними, яких вона не контролює. Помилка коштує
   * відкату на ручний ввід, а не кривого запису в бюджет.
   */
  it('rejects a category that was not in the list we sent', () => {
    expect(normalizeResult(model({ category_id: 'crypto_moon' }), ctx)).toEqual({ isTransaction: false });
  });

  it('rejects an amount that is not a positive finite number', () => {
    for (const amount of [0, -10, 'багато', null, NaN, Infinity]) {
      expect(normalizeResult(model({ amount }), ctx)).toEqual({ isTransaction: false });
    }
  });

  it("lets the category's own type overrule the model's guess", () => {
    // Модель сказала «витрата», але категорія — дохідна: вірити треба категорії.
    expect(normalizeResult(model({ category_id: 'salary', type: 'expense' }), ctx)).toMatchObject({
      categoryId: 'salary',
      type: 'income',
    });
  });

  it("keeps the model's type when the category is not type-specific", () => {
    expect(normalizeResult(model({ category_id: 'other', type: 'income' }), ctx)).toMatchObject({ type: 'income' });
    expect(normalizeResult(model({ category_id: 'other', type: 'expense' }), ctx)).toMatchObject({ type: 'expense' });
  });

  it('falls back to the default currency for anything unsupported', () => {
    expect(normalizeResult(model({ currency: 'EUR' }), ctx)).toMatchObject({ currency: 'UAH' });
    expect(normalizeResult(model({ currency: 'pln' }), ctx)).toMatchObject({ currency: 'PLN' });
    expect(normalizeResult(model({ currency: 'USD' }), { ...ctx, defaultCurrency: 'PLN' })).toMatchObject({
      currency: 'USD',
    });
  });

  it('keeps a valid operation date and falls back to today for a broken one', () => {
    expect(normalizeResult(model({ date: '2026-08-22' }), { ...ctx, today: '2026-08-23' })).toMatchObject({
      date: '2026-08-22',
    });
    expect(normalizeResult(model({ date: '22 серпня' }), { ...ctx, today: '2026-08-23' })).toMatchObject({
      date: '2026-08-23',
    });
  });

  it('attaches an account only when the key matches one the user owns', () => {
    expect(normalizeResult(model({ account_key: 'CARD_PKO' }), ctx)).toMatchObject({
      accountKey: 'card_pko',
      accountName: 'Картка PKO',
    });
    expect(normalizeResult(model({ account_key: 'someone_elses' }), ctx)).toMatchObject({
      accountKey: null,
      accountName: null,
    });
  });

  it('falls back to the category name when the note is empty, and caps a long one', () => {
    expect(normalizeResult(model({ note: '   ' }), ctx)).toMatchObject({ note: 'Кафе' });
    expect(normalizeResult(model({ note: 'я'.repeat(100) }), ctx).note).toHaveLength(60);
  });
});

describe('buildSystemPrompt', () => {
  const today = '2026-08-23';

  it('lists every category id the model is allowed to pick', () => {
    const prompt = buildSystemPrompt({ categories, accounts, defaultCurrency: 'UAH', today });
    for (const c of categories) expect(prompt).toContain(`id="${c.id}"`);
    expect(prompt).toContain('key="cash_uah"');
    expect(prompt).toContain(today);
  });

  it('includes category aliases when they are available', () => {
    const prompt = buildSystemPrompt({
      categories: [{ id: 'clothing', name: 'Одяг', type: 'expense', aliases: ['одежда', 'clothes'] }],
      accounts: [],
      defaultCurrency: 'UAH',
      today,
    });
    expect(prompt).toContain('синоніми: одежда, clothes');
  });

  it('says so plainly when there are no accounts', () => {
    const prompt = buildSystemPrompt({ categories, accounts: [], defaultCurrency: 'UAH', today });
    expect(prompt).toContain('(рахунків немає)');
  });

  it('names the fallback currency it was given', () => {
    expect(buildSystemPrompt({ categories, accounts, defaultCurrency: 'PLN', today })).toContain('"PLN"');
  });

  it('keeps balances and exchange-rate metadata out of screenshot transactions', () => {
    const prompt = buildSystemPrompt({ categories, accounts, defaultCurrency: 'UAH', today });
    expect(prompt).toContain('а не баланс після');
    expect(prompt).toContain('суму списання у валюті рахунку');
  });
});

describe('preferExplicitCategory', () => {
  const available = [
    { id: 'clothing', name: 'Одяг', type: 'expense', aliases: ['одежда', 'одежду', 'clothes'] },
    { id: 'other_expense', name: 'Інше', type: 'expense' },
  ];

  it('replaces a catch-all with an explicitly named category alias', () => {
    expect(preferExplicitCategory({
      isTransaction: true,
      categoryId: 'other_expense',
      categoryName: 'Інше',
      type: 'expense',
    }, { text: '2070 одежда пумб', categories: available })).toMatchObject({
      categoryId: 'clothing',
      categoryName: 'Одяг',
      type: 'expense',
    });
  });

  it('does not override a specific model category or match inside another word', () => {
    const specific = { isTransaction: true, categoryId: 'food', categoryName: 'Продукти', type: 'expense' };
    expect(preferExplicitCategory(specific, { text: 'одежда', categories: available })).toBe(specific);
    const generic = { isTransaction: true, categoryId: 'other_expense', categoryName: 'Інше', type: 'expense' };
    expect(preferExplicitCategory(generic, { text: 'суперодеждамагазин', categories: available })).toBe(generic);
  });
});

describe('buildResponseSchema / toGeminiSchema', () => {
  it('constrains category_id to the ids that were passed', () => {
    const schema = buildResponseSchema(['a', 'b']);
    expect(schema.properties.category_id.enum).toEqual(['a', 'b']);
    expect(schema.required).toContain('category_id');
    expect(schema.required).toContain('date');
    expect(schema.properties.date).toEqual({ type: 'string' });
  });

  it('rewrites types into Gemini spelling and leaves everything else alone', () => {
    const gemini = toGeminiSchema(buildResponseSchema(['a']));
    expect(gemini.type).toBe('OBJECT');
    expect(gemini.properties.amount.type).toBe('NUMBER');
    expect(gemini.properties.is_transaction.type).toBe('BOOLEAN');
    expect(gemini.properties.category_id).toEqual({ type: 'STRING', enum: ['a'] });
    expect(gemini.required).toEqual(buildResponseSchema(['a']).required);
  });

  it('does not mutate the schema it was handed', () => {
    const schema = buildResponseSchema(['a']);
    toGeminiSchema(schema);
    expect(schema.type).toBe('object');
  });

  it('throws on a type it cannot translate instead of shipping it', () => {
    expect(() => toGeminiSchema({ type: 'null' })).toThrow(/unsupported type/);
  });
});
