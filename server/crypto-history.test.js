import { describe, expect, it } from 'vitest';
import { selectMonthStartAndLatestPrices } from './crypto-history.js';

describe('crypto month-start history', () => {
  it('selects the first price on or after the current calendar month begins', () => {
    const prices = [
      [Date.UTC(2026, 6, 31, 23), 90],
      [Date.UTC(2026, 7, 1, 0), 100],
      [Date.UTC(2026, 7, 1, 1), 105],
      [Date.UTC(2026, 7, 3, 12), 120],
    ];
    expect(selectMonthStartAndLatestPrices(prices, new Date('2026-08-03T14:00:00Z'))).toEqual({
      monthStart: 100,
      now: 120,
    });
  });

  it('falls back safely when the chart starts after month start', () => {
    const prices = [
      [Date.UTC(2026, 7, 2, 0), 110],
      [Date.UTC(2026, 7, 3, 0), 115],
    ];
    expect(selectMonthStartAndLatestPrices(prices, new Date('2026-08-03T14:00:00Z'))).toEqual({
      monthStart: 110,
      now: 115,
    });
  });
});
