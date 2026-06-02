import type { Transaction } from '../types';
import { stripAccountFromNote } from './transactionAccount';
import {
  getPeriodBounds,
  getPreviousPeriodBounds,
  isInPeriod,
  type PeriodAnchors,
  type StatsRange,
} from './statsPeriod';

export type SpendingInsightsRange = StatsRange;

export type SpendingInsights = {
  currentExpense: number;
  previousExpense: number;
  trend:
    | {
        percent: number;
        delta: number;
      }
    | null;
  growingCategory:
    | {
        categoryId: string;
        delta: number;
        current: number;
        previous: number;
      }
    | null;
  anomaly:
    | {
        amount: number;
        date: string;
        average: number;
      }
    | null;
  recurring:
    | {
        label: string;
        count: number;
        averageAmount: number;
        cadenceDays: number;
      }
    | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const extractRecurringLabel = (note?: string): string | null => {
  const clean = stripAccountFromNote(note?.trim() ?? '');
  if (!clean) return null;
  const firstChunk = clean.split(/[•|,]/)[0]?.trim() ?? '';
  if (!firstChunk || firstChunk.length < 3) return null;
  if (/^\d+$/.test(firstChunk)) return null;
  const lowered = firstChunk.toLowerCase();
  if (lowered === 'added via telegram bot' || lowered.includes('корекція балансу')) return null;
  return firstChunk.slice(0, 32);
};

const buildCategoryTotals = (
  transactions: readonly Transaction[],
  convertAmount: (amount: number, from: Transaction['currency']) => number
): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    totals.set(tx.categoryId, (totals.get(tx.categoryId) ?? 0) + convertAmount(tx.amount, tx.currency));
  }
  return totals;
};

export const buildSpendingInsights = (params: {
  transactions: readonly Transaction[];
  convertAmount: (amount: number, from: Transaction['currency']) => number;
  range: SpendingInsightsRange;
  anchors: PeriodAnchors;
}): SpendingInsights => {
  const { transactions, convertAmount, range, anchors } = params;
  const current = getPeriodBounds(range, anchors);
  const previous = getPreviousPeriodBounds(range, anchors);

  const currentExpenses = transactions.filter((tx) => tx.type === 'expense' && isInPeriod(tx.date, current));
  const previousExpenses = transactions.filter((tx) => tx.type === 'expense' && isInPeriod(tx.date, previous));

  const currentExpense = currentExpenses.reduce((sum, tx) => sum + convertAmount(tx.amount, tx.currency), 0);
  const previousExpense = previousExpenses.reduce((sum, tx) => sum + convertAmount(tx.amount, tx.currency), 0);
  const delta = currentExpense - previousExpense;
  const trend =
    previousExpense > 0 && Math.abs(delta) > 0.01
      ? {
          percent: (delta / previousExpense) * 100,
          delta,
        }
      : null;

  const currentCategoryTotals = buildCategoryTotals(currentExpenses, convertAmount);
  const previousCategoryTotals = buildCategoryTotals(previousExpenses, convertAmount);
  let growingCategory: SpendingInsights['growingCategory'] = null;
  for (const categoryId of new Set([...currentCategoryTotals.keys(), ...previousCategoryTotals.keys()])) {
    const currentTotal = currentCategoryTotals.get(categoryId) ?? 0;
    const previousTotal = previousCategoryTotals.get(categoryId) ?? 0;
    const categoryDelta = currentTotal - previousTotal;
    if (categoryDelta <= 0) continue;
    if (!growingCategory || categoryDelta > growingCategory.delta) {
      growingCategory = {
        categoryId,
        delta: categoryDelta,
        current: currentTotal,
        previous: previousTotal,
      };
    }
  }

  const anomaly = (() => {
    if (currentExpenses.length < 3) return null;
    const amounts = currentExpenses.map((tx) => convertAmount(tx.amount, tx.currency));
    const average = amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
    const biggestIndex = amounts.reduce((best, value, index, list) => (value > list[best] ? index : best), 0);
    const biggest = amounts[biggestIndex];
    if (!(biggest > average * 2 && biggest - average > 0.01)) return null;
    return {
      amount: biggest,
      date: currentExpenses[biggestIndex].date,
      average,
    };
  })();

  const recurring = (() => {
    const groups = new Map<string, Array<{ amount: number; date: string }>>();
    for (const tx of currentExpenses) {
      const label = extractRecurringLabel(tx.note);
      if (!label) continue;
      const list = groups.get(label) ?? [];
      list.push({
        amount: convertAmount(tx.amount, tx.currency),
        date: tx.date,
      });
      groups.set(label, list);
    }

    let best: SpendingInsights['recurring'] = null;
    for (const [label, items] of groups.entries()) {
      if (items.length < 2) continue;
      const sorted = items.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const averageAmount = sorted.reduce((sum, item) => sum + item.amount, 0) / sorted.length;
      if (!(averageAmount > 0)) continue;
      const maxDeviation = sorted.reduce(
        (max, item) => Math.max(max, Math.abs(item.amount - averageAmount) / averageAmount),
        0
      );
      if (maxDeviation > 0.35) continue;
      const cadenceDays =
        sorted.length >= 2
          ? sorted
              .slice(1)
              .reduce(
                (sum, item, index) =>
                  sum + (new Date(item.date).getTime() - new Date(sorted[index].date).getTime()) / DAY_MS,
                0
              ) /
            (sorted.length - 1)
          : 0;
      if (!(cadenceDays >= 5 && cadenceDays <= 45)) continue;
      if (!best || sorted.length > best.count || cadenceDays < best.cadenceDays) {
        best = {
          label,
          count: sorted.length,
          averageAmount,
          cadenceDays,
        };
      }
    }
    return best;
  })();

  return {
    currentExpense,
    previousExpense,
    trend,
    growingCategory,
    anomaly,
    recurring,
  };
};
