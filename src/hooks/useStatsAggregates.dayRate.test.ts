// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Transaction } from '../types';
import { useStatsAggregates } from './useStatsAggregates';

const bounds = { start: new Date('2026-09-01'), end: new Date('2026-09-30T23:59:59') };
const previousBounds = { start: new Date('2026-08-01'), end: new Date('2026-08-31T23:59:59') };

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  amount: 1000,
  currency: 'UAH',
  categoryId: 'food',
  type: 'expense',
  date: '2026-09-10T10:00:00.000Z',
  note: '',
  ...over,
});

/** «Сьогоднішній» курс: гривня подешевшала, 12 ₴ за злотий замість 10.5. */
const todayRate = (amount: number, from: string) => (from === 'UAH' ? amount / 12 : amount);

describe('useStatsAggregates за курсом дня операції', () => {
  it('бере суму, записану за курсом дня, а не перераховує сьогоднішнім', () => {
    const transactions = [tx({ amountPln: 95.24, amountUah: 1000, amountUsd: 24.39 })];
    const { result } = renderHook(() =>
      useStatsAggregates({
        transactions,
        convertAmount: todayRate,
        displayCurrency: 'PLN',
        bounds,
        previousBounds,
        chartType: 'expense',
      }),
    );
    // Вересень лишається 95.24 zł, хоча сьогоднішній курс дав би 83.33.
    expect(result.current.expense).toBe(95.24);
  });

  it('операція без записаної суми рахується, як і раніше, сьогоднішнім курсом', () => {
    const transactions = [tx({})];
    const { result } = renderHook(() =>
      useStatsAggregates({
        transactions,
        convertAmount: todayRate,
        displayCurrency: 'PLN',
        bounds,
        previousBounds,
        chartType: 'expense',
      }),
    );
    expect(result.current.expense).toBeCloseTo(83.33, 2);
  });

  it('попередній період теж за курсом своїх днів', () => {
    const transactions = [tx({ date: '2026-08-10T10:00:00.000Z', amountPln: 100, amountUah: 1050 })];
    const { result } = renderHook(() =>
      useStatsAggregates({
        transactions,
        convertAmount: todayRate,
        displayCurrency: 'PLN',
        bounds,
        previousBounds,
        chartType: 'expense',
      }),
    );
    expect(result.current.previousExpense).toBe(100);
  });
});
