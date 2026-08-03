import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import type { CurrencyCode } from './currency';
import {
  computePortfolioMonthStartUahPln,
  computeWealthMonthChangePercent,
  portfolioNeedsCryptoHistory,
  priorNetInDisplayCurrency,
} from './portfolioMonthChange';

const fixedNow = new Date('2026-05-02T12:00:00Z');

/** USD→UAH x40, USD→PLN x4, UAH↔PLN x10 */
const convertSimple = (amount: number, from: CurrencyCode, to?: CurrencyCode): number => {
  const t = (to ?? 'UAH') as CurrencyCode;
  if (from === t) return amount;
  if (from === 'USD' && t === 'UAH') return amount * 40;
  if (from === 'USD' && t === 'PLN') return amount * 4;
  if (from === 'UAH' && t === 'PLN') return amount / 10;
  if (from === 'PLN' && t === 'UAH') return amount * 10;
  return amount;
};

describe('portfolioMonthChange', () => {
  it('portfolioNeedsCryptoHistory is true only for crypto with parsed position', () => {
    expect(
      portfolioNeedsCryptoHistory([
        { accountKey: 'x', section: 'bank', primaryAmount: 1, primaryCurrency: 'UAH', subText: '' },
      ]),
    ).toBe(false);
    expect(
      portfolioNeedsCryptoHistory([
        {
          accountKey: 'c',
          section: 'crypto',
          primaryAmount: 100,
          primaryCurrency: 'UAH',
          subText: '0.5 BTC',
        },
      ]),
    ).toBe(true);
  });

  it('rolls back only linked transactions from the current calendar month', () => {
    const accounts = [
      { accountKey: 'pumb', section: 'bank', primaryAmount: 10000, primaryCurrency: 'UAH' as const },
    ];
    const transactions: Transaction[] = [
      {
        id: 'current-month',
        amount: 500,
        currency: 'UAH',
        categoryId: 'salary',
        type: 'income',
        date: '2026-05-01T10:00:00.000Z',
        note: 'Salary Account: pumb',
      },
      {
        id: 'previous-month-but-within-30-days',
        amount: 1200,
        currency: 'UAH',
        categoryId: 'salary',
        type: 'income',
        date: '2026-04-20T10:00:00.000Z',
        note: 'Salary Account: pumb',
      },
      {
        id: 'future',
        amount: 900,
        currency: 'UAH',
        categoryId: 'salary',
        type: 'income',
        date: '2026-05-03T10:00:00.000Z',
        note: 'Salary Account: pumb',
      },
    ];
    const prior = computePortfolioMonthStartUahPln({
      accounts,
      transactions,
      convertAmount: convertSimple,
      cryptoHistory: null,
      now: fixedNow,
    });
    expect(prior).toEqual({ uah: 9500, pln: 0 });
    expect(prior).not.toBeNull();
    const priorNet = priorNetInDisplayCurrency(prior!, convertSimple);
    expect(computeWealthMonthChangePercent(10000, priorNet)).toBeCloseTo((500 / 9500) * 100, 5);
  });

  it('returns null when crypto needs month-start history but history is missing', () => {
    const accounts = [
      {
        accountKey: 'c',
        section: 'crypto',
        primaryAmount: 0,
        primaryCurrency: 'UAH' as const,
        subText: '1 BTC',
      },
    ];
    expect(
      computePortfolioMonthStartUahPln({
        accounts,
        transactions: [],
        convertAmount: convertSimple,
        cryptoHistory: null,
        now: fixedNow,
      }),
    ).toBe(null);
  });

  it('values crypto from the price at the start of the current month', () => {
    const accounts = [
      {
        accountKey: 'c',
        section: 'crypto',
        primaryAmount: 999,
        primaryCurrency: 'UAH' as const,
        subText: '1 BTC',
      },
    ];
    const prior = computePortfolioMonthStartUahPln({
      accounts,
      transactions: [],
      convertAmount: convertSimple,
      cryptoHistory: {
        pricesNow: { BTC: 100_000 },
        pricesMonthStart: { BTC: 80_000 },
      },
      now: fixedNow,
    });
    expect(prior?.uah).toBe(80_000 * 40);
  });

  it('computeWealthMonthChangePercent returns null when prior base is near zero', () => {
    expect(computeWealthMonthChangePercent(100, 0)).toBe(null);
  });
});
