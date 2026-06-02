import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { buildSpendingInsights } from './spendingInsights';
import { createDefaultAnchors } from './statsPeriod';

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
      anchors: createDefaultAnchors(new Date(2026, 4, 15)),
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

  it('computes the trend against the previous ISO week', () => {
    const transactions: Transaction[] = [
      {
        id: 'prev-week',
        amount: 100,
        currency: 'UAH',
        categoryId: 'food',
        type: 'expense',
        date: '2026-05-27T10:00:00',
        note: 'Shop',
      },
      {
        id: 'cur-week',
        amount: 250,
        currency: 'UAH',
        categoryId: 'food',
        type: 'expense',
        date: '2026-06-03T10:00:00',
        note: 'Shop',
      },
    ];

    const result = buildSpendingInsights({
      transactions,
      convertAmount,
      range: 'week',
      anchors: createDefaultAnchors(new Date(2026, 5, 3)),
    });

    expect(result.currentExpense).toBe(250);
    expect(result.previousExpense).toBe(100);
    expect(result.trend?.percent).toBeCloseTo(150, 3);
  });

  it('uses the selected year anchor for the year range', () => {
    const transactions: Transaction[] = [
      {
        id: 'y2025',
        amount: 400,
        currency: 'UAH',
        categoryId: 'food',
        type: 'expense',
        date: '2025-08-10T10:00:00',
        note: 'Shop',
      },
      {
        id: 'y2026',
        amount: 900,
        currency: 'UAH',
        categoryId: 'food',
        type: 'expense',
        date: '2026-02-10T10:00:00',
        note: 'Shop',
      },
    ];

    const result = buildSpendingInsights({
      transactions,
      convertAmount,
      range: 'year',
      anchors: createDefaultAnchors(new Date(2026, 1, 15)),
    });

    expect(result.currentExpense).toBe(900);
    expect(result.previousExpense).toBe(400);
  });
});
