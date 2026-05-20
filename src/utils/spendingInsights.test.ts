import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { buildSpendingInsights } from './spendingInsights';

const convertAmount = (amount: number) => amount;

describe('spendingInsights', () => {
  it('builds trend, growing category, anomaly, and recurring hints', () => {
    const transactions: Transaction[] = [
      {
        id: 'prev-food',
        amount: 120,
        currency: 'UAH',
        categoryId: 'food',
        type: 'expense',
        date: '2026-04-04T10:00:00.000Z',
        note: 'Biedronka Account: wallet',
      },
      {
        id: 'prev-home',
        amount: 80,
        currency: 'UAH',
        categoryId: 'home',
        type: 'expense',
        date: '2026-04-11T10:00:00.000Z',
        note: 'Rent Account: wallet',
      },
      {
        id: 'cur-1',
        amount: 150,
        currency: 'UAH',
        categoryId: 'food',
        type: 'expense',
        date: '2026-05-03T10:00:00.000Z',
        note: 'Netflix Account: wallet',
      },
      {
        id: 'cur-2',
        amount: 155,
        currency: 'UAH',
        categoryId: 'food',
        type: 'expense',
        date: '2026-05-10T10:00:00.000Z',
        note: 'Netflix Account: wallet',
      },
      {
        id: 'cur-3',
        amount: 145,
        currency: 'UAH',
        categoryId: 'food',
        type: 'expense',
        date: '2026-05-17T10:00:00.000Z',
        note: 'Netflix Account: wallet',
      },
      {
        id: 'cur-big',
        amount: 500,
        currency: 'UAH',
        categoryId: 'transport',
        type: 'expense',
        date: '2026-05-20T10:00:00.000Z',
        note: 'Repair Account: wallet',
      },
    ];

    const result = buildSpendingInsights({
      transactions,
      convertAmount,
      range: 'month',
      selectedMonth: new Date('2026-05-01T00:00:00.000Z'),
      now: new Date('2026-05-25T12:00:00.000Z'),
    });

    expect(result.currentExpense).toBe(950);
    expect(result.previousExpense).toBe(200);
    expect(result.trend?.percent).toBeCloseTo(375, 3);
    expect(result.growingCategory).toMatchObject({
      categoryId: 'transport',
      delta: 500,
    });
    expect(result.anomaly).toMatchObject({
      amount: 500,
      date: '2026-05-20T10:00:00.000Z',
    });
    expect(result.recurring).toMatchObject({
      label: 'Netflix',
      count: 3,
    });
  });
});
