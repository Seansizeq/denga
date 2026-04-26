import { describe, expect, it } from 'vitest';
import { buildPastDays, isWithinLastDays } from './dateRanges';

describe('dateRanges', () => {
  it('includes past dates in 7-day window', () => {
    const now = new Date('2026-04-26T12:00:00Z');
    expect(isWithinLastDays('2026-04-26T08:00:00Z', 7, now)).toBe(true);
    expect(isWithinLastDays('2026-04-20T08:00:00Z', 7, now)).toBe(true);
  });

  it('excludes future dates in 7-day window', () => {
    const now = new Date('2026-04-26T12:00:00Z');
    expect(isWithinLastDays('2026-04-27T08:00:00Z', 7, now)).toBe(false);
  });

  it('builds descending past day list', () => {
    const now = new Date('2026-04-26T12:00:00Z');
    expect(buildPastDays(3, now)).toEqual(['2026-04-26', '2026-04-25', '2026-04-24']);
  });
});
