import { describe, expect, it } from 'vitest';
import {
  createDefaultAnchors,
  getPeriodBounds,
  getPreviousPeriodBounds,
  isCurrentPeriod,
  isInPeriod,
  shiftPeriod,
  toIsoDateParam,
  type PeriodAnchors,
} from './statsPeriod';

const anchorsFor = (now: Date): PeriodAnchors => createDefaultAnchors(now);

describe('statsPeriod bounds', () => {
  it('builds a single-day half-open interval for today', () => {
    const now = new Date('2026-06-02T15:30:00');
    const bounds = getPeriodBounds('today', anchorsFor(now));
    expect(bounds.start).toEqual(new Date('2026-06-02T00:00:00'));
    expect(bounds.end).toEqual(new Date('2026-06-03T00:00:00'));
  });

  it('builds a Monday..next-Monday interval for week', () => {
    // 2026-06-02 is a Tuesday; ISO week starts Monday 2026-06-01.
    const now = new Date('2026-06-02T15:30:00');
    const bounds = getPeriodBounds('week', anchorsFor(now));
    expect(bounds.start.getDay()).toBe(1);
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('builds a calendar month interval', () => {
    const now = new Date('2026-06-15T00:00:00');
    const bounds = getPeriodBounds('month', anchorsFor(now));
    expect(bounds.start).toEqual(new Date(2026, 5, 1));
    expect(bounds.end).toEqual(new Date(2026, 6, 1));
  });

  it('builds a calendar year interval', () => {
    const now = new Date('2026-06-15T00:00:00');
    const bounds = getPeriodBounds('year', anchorsFor(now));
    expect(bounds.start).toEqual(new Date(2026, 0, 1));
    expect(bounds.end).toEqual(new Date(2027, 0, 1));
  });
});

describe('statsPeriod ISO week across month boundary', () => {
  it('keeps a week that spans two months as one continuous interval', () => {
    // 2026-07-01 is a Wednesday; its ISO week starts Monday 2026-06-29.
    const now = new Date('2026-07-01T12:00:00');
    const bounds = getPeriodBounds('week', anchorsFor(now));
    expect(bounds.start).toEqual(new Date('2026-06-29T00:00:00'));
    expect(bounds.end).toEqual(new Date('2026-07-06T00:00:00'));
    expect(isInPeriod('2026-06-30T10:00:00', bounds)).toBe(true);
    expect(isInPeriod('2026-07-02T10:00:00', bounds)).toBe(true);
  });
});

describe('statsPeriod navigation', () => {
  it('shifts year across the 2024/2025 boundary', () => {
    const anchors = createDefaultAnchors(new Date('2025-03-10T00:00:00'));
    const prev = shiftPeriod('year', anchors, -1);
    expect(prev.selectedYear).toBe(2024);
    const back = shiftPeriod('year', prev, 1);
    expect(back.selectedYear).toBe(2025);
  });

  it('shifts month across the year boundary', () => {
    const anchors = createDefaultAnchors(new Date('2026-01-15T00:00:00'));
    const prev = shiftPeriod('month', anchors, -1);
    expect(prev.selectedMonth).toEqual(new Date(2025, 11, 1));
  });

  it('shifts a day and a week', () => {
    const anchors = createDefaultAnchors(new Date('2026-06-02T12:00:00'));
    expect(shiftPeriod('today', anchors, -1).selectedDay).toEqual(new Date('2026-06-01T00:00:00'));
    const prevWeek = shiftPeriod('week', anchors, -1);
    expect(prevWeek.selectedWeek).toEqual(new Date('2026-05-26T00:00:00'));
  });

  it('previous period bounds line up with the current period start', () => {
    const anchors = createDefaultAnchors(new Date('2026-06-15T00:00:00'));
    const current = getPeriodBounds('month', anchors);
    const previous = getPreviousPeriodBounds('month', anchors);
    expect(previous.end).toEqual(current.start);
    expect(previous.start).toEqual(new Date(2026, 4, 1));
  });
});

describe('statsPeriod current detection', () => {
  it('detects the current period and a shifted, past one', () => {
    const now = new Date('2026-06-02T12:00:00');
    const anchors = createDefaultAnchors(now);
    expect(isCurrentPeriod('today', anchors, now)).toBe(true);
    expect(isCurrentPeriod('month', anchors, now)).toBe(true);
    const past = shiftPeriod('month', anchors, -1);
    expect(isCurrentPeriod('month', past, now)).toBe(false);
  });
});

describe('toIsoDateParam', () => {
  it('formats a local calendar date without timezone drift', () => {
    expect(toIsoDateParam(new Date(2026, 5, 2))).toBe('2026-06-02');
    expect(toIsoDateParam(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});
