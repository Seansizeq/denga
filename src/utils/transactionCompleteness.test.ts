import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { createCustomCategoryId } from '../constants/categories';
import { getMissingFields, isIncomplete } from './transactionCompleteness';

const expense: Transaction = {
  id: 'e1',
  amount: 320,
  currency: 'UAH',
  categoryId: 'food',
  type: 'expense',
  date: '2026-10-10T00:00:00.000Z',
  accountKey: 'mono',
};

const withAccounts = { hasAccounts: true };

describe('getMissingFields', () => {
  it('treats an expense with an account and a real category as complete', () => {
    const missing = getMissingFields(expense, withAccounts);
    expect(missing).toEqual({ account: false, category: false });
    expect(isIncomplete(missing)).toBe(false);
  });

  it('flags a missing account', () => {
    expect(getMissingFields({ ...expense, accountKey: null }, withAccounts).account).toBe(true);
  });

  it('accepts the legacy account marker in the note', () => {
    const legacy = { ...expense, accountKey: null, note: 'Сільпо Account: mono' };
    expect(getMissingFields(legacy, withAccounts).account).toBe(false);
  });

  it('does not ask for an account when the person has none', () => {
    expect(getMissingFields({ ...expense, accountKey: null }, { hasAccounts: false }).account).toBe(false);
  });

  it('flags «Інше» and unknown categories, but not custom ones', () => {
    expect(getMissingFields({ ...expense, categoryId: 'other_expense' }, withAccounts).category).toBe(true);
    expect(
      getMissingFields({ ...expense, type: 'income', categoryId: 'other_income' }, withAccounts).category,
    ).toBe(true);
    expect(getMissingFields({ ...expense, categoryId: 'no_such_category' }, withAccounts).category).toBe(true);
    expect(getMissingFields({ ...expense, categoryId: '' }, withAccounts).category).toBe(true);
    const custom = createCustomCategoryId('Кава', 'Coffee', '#7C5CFF');
    expect(getMissingFields({ ...expense, categoryId: custom }, withAccounts).category).toBe(false);
  });

  it('checks both sides of a transfer and never its category', () => {
    const transfer = {
      ...expense,
      type: 'transfer' as const,
      categoryId: 'transfer',
      accountKey: null,
      fromAccountKey: 'mono',
      toAccountKey: 'cash',
    };
    expect(getMissingFields(transfer, withAccounts)).toEqual({ account: false, category: false });
    expect(getMissingFields({ ...transfer, toAccountKey: undefined }, withAccounts).account).toBe(true);
  });

  it('leaves balance corrections alone', () => {
    const correction = { ...expense, categoryId: 'balance_correction', accountKey: null };
    expect(isIncomplete(getMissingFields(correction, withAccounts))).toBe(false);
  });
});
