import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { getTransactionAccountEffects, isBalanceCorrection } from './transactionUtils';

const correction: Transaction = {
  id: 'c1',
  amount: 2200,
  currency: 'UAH',
  categoryId: 'balance_correction',
  type: 'income',
  date: '2026-08-15T10:00:00.000Z',
  note: 'Корекція балансу Account: privat_uah',
};

describe('balance correction', () => {
  it('is recognised by its category', () => {
    expect(isBalanceCorrection(correction)).toBe(true);
    expect(isBalanceCorrection({ ...correction, categoryId: 'salary' })).toBe(false);
  });

  it('still counts as a balance movement', () => {
    // Виправлення справді змінило залишок, тож перерахунок «скільки було на
    // початку місяця» має його враховувати — інакше воно виглядало б як дохід
    // від зростання капіталу.
    expect(getTransactionAccountEffects(correction)).toEqual([
      { accountKey: 'privat_uah', delta: 2200, currency: 'UAH' },
    ]);
  });
});
