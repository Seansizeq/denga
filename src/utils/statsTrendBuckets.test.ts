import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { buildTrendBuckets } from './statsTrendBuckets';
import { createDefaultAnchors } from './statsPeriod';

const convertAmount = (amount: number) => amount;

const tx = (id: string, date: string, amount: number, type: Transaction['type'] = 'expense'): Transaction => ({
  id,
  amount,
  currency: 'UAH',
  categoryId: 'food',
  type,
  date,
  note: 'x',
});

describe('buildTrendBuckets', () => {
  it('produces 7 day buckets for a week and sums the matching type', () => {
    const transactions = [
      tx('a', '2026-06-01T10:00:00', 100), // Monday
      tx('b', '2026-06-03T10:00:00', 50), // Wednesday
      tx('c', '2026-06-03T18:00:00', 25), // Wednesday
      tx('d', '2026-06-03T18:00:00', 999, 'income'), // ignored type
    ];
    const buckets = buildTrendBuckets({
      transactions,
      convertAmount,
      type: 'expense',
      range: 'week',
      anchors: createDefaultAnchors(new Date(2026, 5, 3)),
      locale: 'en-US',
    });
    expect(buckets).toHaveLength(7);
    expect(buckets[0].amount).toBe(100);
    expect(buckets[2].amount).toBe(75);
  });

  it('produces weekly buckets covering the whole month', () => {
    const buckets = buildTrendBuckets({
      transactions: [tx('a', '2026-06-30T10:00:00', 200)],
      convertAmount,
      type: 'expense',
      range: 'month',
      anchors: createDefaultAnchors(new Date(2026, 5, 15)),
      locale: 'en-US',
    });
    expect(buckets[0].label).toBe('1–7');
    expect(buckets[buckets.length - 1].to).toEqual(new Date(2026, 6, 1));
    expect(buckets[buckets.length - 1].amount).toBe(200);
  });

  it('produces 12 month buckets for a year', () => {
    const buckets = buildTrendBuckets({
      transactions: [tx('a', '2026-02-10T10:00:00', 400)],
      convertAmount,
      type: 'expense',
      range: 'year',
      anchors: createDefaultAnchors(new Date(2026, 1, 15)),
      locale: 'en-US',
    });
    expect(buckets).toHaveLength(12);
    expect(buckets[1].amount).toBe(400);
  });

  it('produces 4 intraday buckets for today', () => {
    const buckets = buildTrendBuckets({
      transactions: [tx('a', '2026-06-02T13:00:00', 80)],
      convertAmount,
      type: 'expense',
      range: 'today',
      anchors: createDefaultAnchors(new Date(2026, 5, 2)),
      locale: 'en-US',
    });
    expect(buckets).toHaveLength(4);
    expect(buckets[2].amount).toBe(80);
  });
});
