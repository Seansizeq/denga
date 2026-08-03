import { describe, expect, it } from 'vitest';
import { getPreviousFullWeekDaySet } from './report-periods.js';

describe('report periods', () => {
  it('uses the completed Monday–Sunday week when run on Monday', () => {
    expect(Array.from(getPreviousFullWeekDaySet('2026-08-03')).sort()).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  it('still uses the previous completed week when requested mid-week', () => {
    const days = Array.from(getPreviousFullWeekDaySet('2026-08-05')).sort();
    expect(days[0]).toBe('2026-07-27');
    expect(days.at(-1)).toBe('2026-08-02');
  });
});
