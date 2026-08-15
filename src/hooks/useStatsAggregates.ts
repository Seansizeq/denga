import { useMemo } from 'react';
import type { Transaction } from '../types';
import type { Denomination } from '../utils/denomination';
import { isInPeriod, type PeriodBounds } from '../utils/statsPeriod';
import { isBalanceCorrection } from '../utils/transactionUtils';

export interface CategoryTotal {
  id: string;
  total: number;
  count: number;
}

export interface StatsAggregates {
  filtered: Transaction[];
  income: number;
  expense: number;
  net: number;
  previousIncome: number;
  previousExpense: number;
  previousNet: number;
  byCategory: CategoryTotal[];
  transactionCount: number;
}

/**
 * Converts an amount from its own denomination into the display currency.
 * Returns null when a crypto price is unavailable, so unpriced rows can be left
 * out of a total instead of distorting it.
 */
type ConvertAmount = (amount: number, from: Denomination) => number | null;

const sumByType = (
  transactions: readonly Transaction[],
  bounds: PeriodBounds,
  convertAmount: ConvertAmount,
): { income: number; expense: number } => {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (!isInPeriod(tx.date, bounds)) continue;
    // Корекція балансу — не рух грошей, а виправлення обліку.
    if (isBalanceCorrection(tx)) continue;
    const amount = convertAmount(tx.amount, tx.currency);
    if (amount === null) continue;
    if (tx.type === 'income') income += amount;
    else if (tx.type === 'expense') expense += amount;
  }
  return { income, expense };
};

export const useStatsAggregates = (params: {
  transactions: readonly Transaction[];
  convertAmount: ConvertAmount;
  bounds: PeriodBounds;
  previousBounds: PeriodBounds;
  chartType: 'expense' | 'income';
}): StatsAggregates => {
  const { transactions, convertAmount, bounds, previousBounds, chartType } = params;

  return useMemo(() => {
    const filtered = transactions.filter((tx) => isInPeriod(tx.date, bounds));

    let income = 0;
    let expense = 0;
    const categoryMap = new Map<string, CategoryTotal>();
    let transactionCount = 0;

    for (const tx of filtered) {
      if (isBalanceCorrection(tx)) continue;
      const amount = convertAmount(tx.amount, tx.currency);
      if (amount === null) continue;
      if (tx.type === 'income') income += amount;
      else if (tx.type === 'expense') expense += amount;

      if (tx.type === chartType) {
        transactionCount += 1;
        const existing = categoryMap.get(tx.categoryId) ?? { id: tx.categoryId, total: 0, count: 0 };
        existing.total += amount;
        existing.count += 1;
        categoryMap.set(tx.categoryId, existing);
      }
    }

    const byCategory = Array.from(categoryMap.values()).sort((a, b) => b.total - a.total);
    const previous = sumByType(transactions, previousBounds, convertAmount);

    return {
      filtered,
      income,
      expense,
      net: income - expense,
      previousIncome: previous.income,
      previousExpense: previous.expense,
      previousNet: previous.income - previous.expense,
      byCategory,
      transactionCount,
    };
  }, [transactions, convertAmount, bounds, previousBounds, chartType]);
};
