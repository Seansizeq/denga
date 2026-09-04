import { describe, expect, it } from 'vitest';
import {
  buildZoneClocks,
  clockForZone,
  collectDueTimes,
  dueReportTypes,
  isReminderDue,
  zoneKey,
} from './auto-reports-schedule.js';

const clock = (day, time, weekday) => ({ day, time, weekday });

describe('buildZoneClocks', () => {
  it('resolves each distinct zone once', () => {
    const calls = [];
    const clocks = buildZoneClocks(['Europe/Kyiv', 'Europe/Kyiv', 'Europe/Warsaw'], (zone) => {
      calls.push(zone);
      return clock('2026-09-07', '21:00', 'mon');
    });

    expect(calls).toEqual(['Europe/Kyiv', 'Europe/Warsaw']);
    expect(clocks.size).toBe(2);
  });

  /** NULL і порожній рядок — той самий «пояс не вказано», інакше пояс резолвиться двічі. */
  it('treats null, undefined and empty string as one zone', () => {
    const clocks = buildZoneClocks([null, undefined, ''], () => clock('2026-09-07', '21:00', 'mon'));

    expect(clocks.size).toBe(1);
    expect(clockForZone(clocks, null)).toEqual(clock('2026-09-07', '21:00', 'mon'));
    expect(clockForZone(clocks, undefined)).toEqual(clock('2026-09-07', '21:00', 'mon'));
    expect(zoneKey(null)).toBe('');
  });

  it('skips a zone the resolver cannot read', () => {
    const clocks = buildZoneClocks(['Nowhere/Nowhere'], () => null);

    expect(clocks.size).toBe(0);
    expect(clockForZone(clocks, 'Nowhere/Nowhere')).toBeNull();
  });
});

describe('collectDueTimes', () => {
  it('returns each local time once', () => {
    const clocks = buildZoneClocks(['a', 'b', 'c'], (zone) =>
      zone === 'c' ? clock('2026-09-07', '20:00', 'mon') : clock('2026-09-07', '21:00', 'mon'),
    );

    expect(collectDueTimes(clocks)).toEqual(['20:00', '21:00']);
  });

  it('is empty when no zone resolved', () => {
    expect(collectDueTimes(new Map())).toEqual([]);
  });
});

describe('dueReportTypes', () => {
  const settings = { autoWeekly: true, autoMonthly: true, sendTime: '21:00' };

  it('sends the weekly report on monday at the chosen time', () => {
    expect(dueReportTypes(clock('2026-09-07', '21:00', 'mon'), settings)).toEqual(['weekly']);
  });

  it('sends the monthly report on the first day of the month', () => {
    expect(dueReportTypes(clock('2026-10-01', '21:00', 'thu'), settings)).toEqual(['monthly']);
  });

  it('sends both when the first of the month is a monday', () => {
    expect(dueReportTypes(clock('2027-02-01', '21:00', 'mon'), settings)).toEqual(['weekly', 'monthly']);
  });

  /**
   * Заради цього рядок і перевіряється вдруге: вибірка з бази бере хвилину
   * будь-якого пояса, тож у неї потрапляють і чужі.
   */
  it('sends nothing when the match came from another zone', () => {
    expect(dueReportTypes(clock('2026-09-07', '20:00', 'mon'), settings)).toEqual([]);
  });

  it('respects the per-user switches', () => {
    const off = { autoWeekly: false, autoMonthly: false, sendTime: '21:00' };
    expect(dueReportTypes(clock('2027-02-01', '21:00', 'mon'), off)).toEqual([]);
  });
});

describe('isReminderDue', () => {
  it('fires only at the reminder time', () => {
    const now = clock('2026-09-07', '21:00', 'mon');
    expect(isReminderDue(now, { enabled: true, timeHHMM: '21:00' })).toBe(true);
    expect(isReminderDue(now, { enabled: true, timeHHMM: '10:00' })).toBe(false);
  });

  it('never fires for a disabled reminder', () => {
    expect(isReminderDue(clock('2026-09-07', '21:00', 'mon'), { enabled: false, timeHHMM: '21:00' })).toBe(false);
  });
});
