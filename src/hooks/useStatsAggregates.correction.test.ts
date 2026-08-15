// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Transaction } from '../types';
import { useStatsAggregates } from './useStatsAggregates';

const bounds = { start: new Date('2026-08-01'), end: new Date('2026-08-31T23:59:59') };
const previousBounds = { start: new Date('2026-07-01'), end: new Date('2026-07-31T23:59:59') };

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  amount: 100,
  currency: 'UAH',
  categoryId: 'salary',
  type: 'income',
  date: '2026-08-10T10:00:00.000Z',
  note: '',
  ...over,
});

describe('useStatsAggregates with a balance correction', () => {
  it('leaves the correction out of income, expense and the category chart', () => {
    const transactions = [
      tx({ amount: 3000, categoryId: 'salary', type: 'income' }),
      tx({ amount: 2200, categoryId: 'balance_correction', type: 'income' }),
      tx({ amount: 500, categoryId: 'food', type: 'expense' }),
    ];

    const { result } = renderHook(() =>
      useStatsAggregates({
        transactions,
        convertAmount: (amount) => amount,
        bounds,
        previousBounds,
        chartType: 'income',
      }),
    );

    expect(result.current.income).toBe(3000);
    expect(result.current.expense).toBe(500);
    expect(result.current.net).toBe(2500);
    expect(result.current.byCategory.map((c) => c.id)).toEqual(['salary']);
  });
});
