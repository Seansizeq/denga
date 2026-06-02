import { getIsoWeekRange } from './formatters';

export type StatsRange = 'today' | 'week' | 'month' | 'year';

export interface PeriodAnchors {
  selectedDay: Date;
  selectedWeek: Date;
  selectedMonth: Date;
  selectedYear: number;
}

export interface PeriodBounds {
  /** Inclusive start of the period. */
  start: Date;
  /** Exclusive end of the period. */
  end: Date;
}

const startOfDay = (input: Date): Date => {
  const next = new Date(input);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (input: Date, days: number): Date => {
  const next = new Date(input);
  next.setDate(next.getDate() + days);
  return next;
};

export const createDefaultAnchors = (now: Date = new Date()): PeriodAnchors => ({
  selectedDay: startOfDay(now),
  selectedWeek: startOfDay(now),
  selectedMonth: new Date(now.getFullYear(), now.getMonth(), 1),
  selectedYear: now.getFullYear(),
});

export const getPeriodBounds = (range: StatsRange, anchors: PeriodAnchors): PeriodBounds => {
  switch (range) {
    case 'today': {
      const start = startOfDay(anchors.selectedDay);
      return { start, end: addDays(start, 1) };
    }
    case 'week': {
      const { start: weekStart } = getIsoWeekRange(anchors.selectedWeek);
      const start = startOfDay(weekStart);
      return { start, end: addDays(start, 7) };
    }
    case 'month': {
      const start = new Date(anchors.selectedMonth.getFullYear(), anchors.selectedMonth.getMonth(), 1);
      const end = new Date(anchors.selectedMonth.getFullYear(), anchors.selectedMonth.getMonth() + 1, 1);
      return { start, end };
    }
    case 'year':
    default: {
      const start = new Date(anchors.selectedYear, 0, 1);
      const end = new Date(anchors.selectedYear + 1, 0, 1);
      return { start, end };
    }
  }
};

export const getPreviousPeriodBounds = (range: StatsRange, anchors: PeriodAnchors): PeriodBounds =>
  getPeriodBounds(range, shiftPeriod(range, anchors, -1));

export const isInPeriod = (iso: string, bounds: PeriodBounds): boolean => {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) && time >= bounds.start.getTime() && time < bounds.end.getTime();
};

export const shiftPeriod = (range: StatsRange, anchors: PeriodAnchors, delta: number): PeriodAnchors => {
  switch (range) {
    case 'today':
      return { ...anchors, selectedDay: addDays(startOfDay(anchors.selectedDay), delta) };
    case 'week':
      return { ...anchors, selectedWeek: addDays(startOfDay(anchors.selectedWeek), delta * 7) };
    case 'month':
      return {
        ...anchors,
        selectedMonth: new Date(
          anchors.selectedMonth.getFullYear(),
          anchors.selectedMonth.getMonth() + delta,
          1,
        ),
      };
    case 'year':
    default:
      return { ...anchors, selectedYear: anchors.selectedYear + delta };
  }
};

export const isCurrentPeriod = (
  range: StatsRange,
  anchors: PeriodAnchors,
  now: Date = new Date(),
): boolean => {
  switch (range) {
    case 'today':
      return startOfDay(anchors.selectedDay).getTime() === startOfDay(now).getTime();
    case 'week':
      return getIsoWeekRange(anchors.selectedWeek).start.getTime() === getIsoWeekRange(now).start.getTime();
    case 'month':
      return (
        anchors.selectedMonth.getFullYear() === now.getFullYear() &&
        anchors.selectedMonth.getMonth() === now.getMonth()
      );
    case 'year':
    default:
      return anchors.selectedYear === now.getFullYear();
  }
};

export const formatPeriodLabel = (
  range: StatsRange,
  anchors: PeriodAnchors,
  locale: string,
): string => {
  switch (range) {
    case 'today':
      return anchors.selectedDay.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    case 'week': {
      const { start, end } = getIsoWeekRange(anchors.selectedWeek);
      const sameMonth =
        start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
      const startStr = start.toLocaleDateString(locale, {
        day: 'numeric',
        month: sameMonth ? undefined : 'short',
      });
      const endStr = end.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: start.getFullYear() === end.getFullYear() ? undefined : 'numeric',
      });
      return `${startStr} – ${endStr}`;
    }
    case 'month':
      return anchors.selectedMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    case 'year':
    default:
      return String(anchors.selectedYear);
  }
};

/** Format an ISO calendar date (YYYY-MM-DD, local) for History deep-link query params. */
export const toIsoDateParam = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
