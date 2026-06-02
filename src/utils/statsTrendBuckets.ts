import type { Transaction } from '../types';
import { getPeriodBounds, isInPeriod, type PeriodAnchors, type StatsRange } from './statsPeriod';

export interface TrendBucket {
  key: string;
  label: string;
  amount: number;
  /** Inclusive start, for History deep links. */
  from: Date;
  /** Exclusive end, for History deep links. */
  to: Date;
}

const addDays = (input: Date, days: number): Date => {
  const next = new Date(input);
  next.setDate(next.getDate() + days);
  return next;
};

const buildBucketRanges = (
  range: StatsRange,
  anchors: PeriodAnchors,
  locale: string,
): TrendBucket[] => {
  const { start, end } = getPeriodBounds(range, anchors);

  if (range === 'today') {
    const buckets: TrendBucket[] = [];
    for (let hour = 0; hour < 24; hour += 6) {
      const from = new Date(start);
      from.setHours(hour, 0, 0, 0);
      const to = new Date(start);
      to.setHours(hour + 6, 0, 0, 0);
      buckets.push({ key: `h${hour}`, label: `${String(hour).padStart(2, '0')}`, amount: 0, from, to });
    }
    return buckets;
  }

  if (range === 'week') {
    const buckets: TrendBucket[] = [];
    for (let i = 0; i < 7; i += 1) {
      const from = addDays(start, i);
      const to = addDays(start, i + 1);
      buckets.push({
        key: `d${i}`,
        label: from.toLocaleDateString(locale, { weekday: 'short' }),
        amount: 0,
        from,
        to,
      });
    }
    return buckets;
  }

  if (range === 'month') {
    const buckets: TrendBucket[] = [];
    let cursor = new Date(start);
    let index = 0;
    while (cursor.getTime() < end.getTime()) {
      const from = new Date(cursor);
      let to = addDays(from, 7);
      if (to.getTime() > end.getTime()) to = new Date(end);
      const lastDay = addDays(to, -1).getDate();
      buckets.push({
        key: `w${index}`,
        label: `${from.getDate()}–${lastDay}`,
        amount: 0,
        from,
        to,
      });
      cursor = to;
      index += 1;
    }
    return buckets;
  }

  const buckets: TrendBucket[] = [];
  for (let month = 0; month < 12; month += 1) {
    const from = new Date(anchors.selectedYear, month, 1);
    const to = new Date(anchors.selectedYear, month + 1, 1);
    buckets.push({
      key: `m${month}`,
      label: from.toLocaleDateString(locale, { month: 'short' }),
      amount: 0,
      from,
      to,
    });
  }
  return buckets;
};

export const buildTrendBuckets = (params: {
  transactions: readonly Transaction[];
  convertAmount: (amount: number, from: Transaction['currency']) => number;
  type: 'expense' | 'income';
  range: StatsRange;
  anchors: PeriodAnchors;
  locale: string;
}): TrendBucket[] => {
  const { transactions, convertAmount, type, range, anchors, locale } = params;
  const buckets = buildBucketRanges(range, anchors, locale);
  const periodBounds = getPeriodBounds(range, anchors);

  for (const tx of transactions) {
    if (tx.type !== type) continue;
    if (!isInPeriod(tx.date, periodBounds)) continue;
    const time = new Date(tx.date).getTime();
    const bucket = buckets.find((b) => time >= b.from.getTime() && time < b.to.getTime());
    if (bucket) bucket.amount += convertAmount(tx.amount, tx.currency);
  }

  return buckets;
};
