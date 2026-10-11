import { describe, expect, it } from 'vitest';
import {
  applySmartFillChoice,
  buildSmartAccountOptions,
  buildSmartCategoryOptions,
  guessSmartAccount,
  nextSmartQuestion,
  parseSmartFillCallback,
} from './smart-transaction-fill.js';

const rows = [
  { accountKey: 'debt_misha', name: 'Михайло', section: 'debt', sortIndex: 0, currency: 'UAH' },
  { accountKey: 'cash_pln', name: 'Готівка', section: 'cash', sortIndex: 0, currency: 'PLN' },
  { accountKey: 'goal_car', name: 'Машина', section: 'goal', sortIndex: 0, currency: 'UAH' },
  { accountKey: 'PUMB', name: 'ПУМБ', section: 'bank', sortIndex: 1, currency: 'uah' },
  { accountKey: 'mono', name: 'monobank', section: 'bank', sortIndex: 0, currency: 'UAH' },
];
const accounts = buildSmartAccountOptions(rows);

const categories = [
  { id: 'other_expense', name: 'Інше', type: 'expense' },
  { id: 'food', name: 'Продукти', type: 'expense' },
  { id: 'salary', name: 'Зарплата', type: 'income' },
  { id: 'custom:Одяг', name: 'Одяг', type: 'expense' },
];
const expenseCategories = buildSmartCategoryOptions(categories, 'expense');

const card = (overrides = {}) => ({
  type: 'expense',
  currency: 'UAH',
  categoryId: 'food',
  categoryName: 'Продукти',
  accountKey: null,
  accountName: null,
  accountOptions: accounts,
  categoryOptions: expenseCategories,
  ...overrides,
});

describe('buildSmartAccountOptions', () => {
  /** З цілі не платять — у застосунку її теж немає серед рахунків операції. */
  it('lists wallet accounts in wallet order and leaves goals out', () => {
    expect(accounts.map((a) => a.key)).toEqual(['mono', 'pumb', 'cash_pln', 'debt_misha']);
    expect(accounts[1]).toEqual({ key: 'pumb', name: 'ПУМБ', section: 'bank', currency: 'UAH' });
  });
});

describe('buildSmartCategoryOptions', () => {
  it('offers the categories of this type, with «Інше» last', () => {
    expect(expenseCategories.map((c) => c.id)).toEqual(['food', 'custom:Одяг', 'other_expense']);
    expect(buildSmartCategoryOptions(categories, 'income').map((c) => c.id)).toEqual(['salary']);
  });
});

describe('guessSmartAccount', () => {
  it('takes the only card or cash in the currency of the purchase', () => {
    expect(guessSmartAccount(accounts, 'PLN')?.key).toBe('cash_pln');
  });

  /** Тиха помилка в рахунку зсуває баланс — із двох гривневих карток бот питає. */
  it('does not pick between two accounts in the same currency', () => {
    expect(guessSmartAccount(accounts, 'UAH')).toBeNull();
  });

  it('does not take a debt just because it matches the currency', () => {
    const onlyDebtInUsd = buildSmartAccountOptions([
      ...rows,
      { accountKey: 'debt_usd', name: 'Оля', section: 'debt', sortIndex: 1, currency: 'USD' },
    ]);
    expect(guessSmartAccount(onlyDebtInUsd, 'USD')).toBeNull();
  });

  it('takes the single account a person has, whatever its currency', () => {
    const single = buildSmartAccountOptions([rows[3]]);
    expect(guessSmartAccount(single, 'USD')?.key).toBe('pumb');
  });

  it('has nothing to guess from an empty wallet', () => {
    expect(guessSmartAccount([], 'UAH')).toBeNull();
  });
});

describe('nextSmartQuestion', () => {
  it('asks for the account first', () => {
    expect(nextSmartQuestion(card({ categoryId: 'other_expense' }))).toBe('account');
  });

  it('asks for the category when it is only the «Інше» placeholder', () => {
    expect(nextSmartQuestion(card({ accountKey: 'mono', categoryId: 'other_expense' }))).toBe('category');
  });

  it('is done once both are filled', () => {
    expect(nextSmartQuestion(card({ accountKey: 'mono' }))).toBeNull();
  });

  /** Рахунок вимагаємо, лише коли людині є з чого обрати — як і застосунок. */
  it('does not ask for an account when there are none', () => {
    expect(nextSmartQuestion(card({ accountOptions: [] }))).toBeNull();
  });

  /** «Інше», обране людиною, — відповідь, а не заглушка; інакше питання ходило б по колу. */
  it('accepts «Інше» once the person picked it', () => {
    expect(
      nextSmartQuestion(card({ accountKey: 'mono', categoryId: 'other_expense', categoryConfirmed: true }))
    ).toBeNull();
  });

  it('keeps a list open that the person opened themselves', () => {
    expect(nextSmartQuestion(card({ accountKey: 'mono', picking: 'account' }))).toBe('account');
  });
});

describe('parseSmartFillCallback', () => {
  it('reads choices, opening a list and going back', () => {
    expect(parseSmartFillCallback('smart_acc:2')).toEqual({ action: 'choose', field: 'account', index: 2 });
    expect(parseSmartFillCallback('smart_cat:0')).toEqual({ action: 'choose', field: 'category', index: 0 });
    expect(parseSmartFillCallback('smart_pick:category')).toEqual({ action: 'open', field: 'category' });
    expect(parseSmartFillCallback('smart_back')).toEqual({ action: 'back' });
  });

  it('ignores everything else', () => {
    expect(parseSmartFillCallback('smart_save')).toBeNull();
    expect(parseSmartFillCallback('smart_debt:1')).toBeNull();
    expect(parseSmartFillCallback('smart_acc:-1')).toBeNull();
    expect(parseSmartFillCallback('smart_pick:date')).toBeNull();
  });
});

describe('applySmartFillChoice', () => {
  it('fills the account and closes the list', () => {
    const next = applySmartFillChoice(card({ picking: 'account' }), { action: 'choose', field: 'account', index: 1 });
    expect(next).toMatchObject({ accountKey: 'pumb', accountName: 'ПУМБ', picking: null });
  });

  it('marks a picked category as the person’s own answer', () => {
    const next = applySmartFillChoice(card(), { action: 'choose', field: 'category', index: 2 });
    expect(next).toMatchObject({ categoryId: 'other_expense', categoryName: 'Інше', categoryConfirmed: true });
  });

  it('refuses a button that is not on this card', () => {
    expect(applySmartFillChoice(card(), { action: 'choose', field: 'account', index: 9 })).toBeNull();
    expect(applySmartFillChoice(card({ accountOptions: [] }), { action: 'open', field: 'account' })).toBeNull();
  });

  it('opens and closes a list without touching the answer', () => {
    const opened = applySmartFillChoice(card({ accountKey: 'mono' }), { action: 'open', field: 'category' });
    expect(opened).toMatchObject({ picking: 'category', categoryId: 'food' });
    expect(applySmartFillChoice(opened, { action: 'back' })).toMatchObject({ picking: null, categoryId: 'food' });
  });
});
