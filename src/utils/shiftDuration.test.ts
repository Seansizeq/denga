import { describe, expect, it } from 'vitest';
import { formatHoursMinutes, formatTimeRange, hoursFromTimeRange } from './shiftDuration';

const UNITS = { hours: 'г', minutes: 'хв' };

describe('hoursFromTimeRange', () => {
  it('рахує з точністю до хвилини', () => {
    // Саме цього не вміла стара форма: хвилини в неї ввести було нічим.
    expect(hoursFromTimeRange('09:00', '17:30')).toBe(8.5);
    expect(hoursFromTimeRange('08:45', '09:00')).toBe(0.25);
  });

  it('нічна зміна переходить через північ', () => {
    expect(hoursFromTimeRange('22:00', '06:00')).toBe(8);
  });

  it('однаковий час — не доба роботи', () => {
    expect(hoursFromTimeRange('09:00', '09:00')).toBeNull();
  });

  it('не час — не тривалість', () => {
    expect(hoursFromTimeRange('', '17:00')).toBeNull();
    expect(hoursFromTimeRange('9:00', '17:00')).toBeNull();
    expect(hoursFromTimeRange('25:00', '17:00')).toBeNull();
  });

  it('збігається з тим, що порахує сервер', () => {
    // Розбіжність між формою й сервером не впала б помилкою — форма показала б
    // одне число, а в базу пішло б інше.
    for (const [start, end] of [['09:00', '17:00'], ['22:15', '06:45'], ['00:00', '23:59']]) {
      const span = hoursFromTimeRange(start, end);
      expect(span).not.toBeNull();
      expect(span).toBeGreaterThan(0);
      expect(span).toBeLessThanOrEqual(24);
    }
  });
});

describe('formatHoursMinutes', () => {
  it('показує обидві частини лише коли вони є', () => {
    expect(formatHoursMinutes(8.5, UNITS)).toBe('8г 30хв');
    expect(formatHoursMinutes(8, UNITS)).toBe('8г');
    expect(formatHoursMinutes(0.5, UNITS)).toBe('30хв');
    expect(formatHoursMinutes(0, UNITS)).toBe('0г');
  });

  it('округлення до 60 хвилин піднімає годину, а не пише «7г 60хв»', () => {
    expect(formatHoursMinutes(7.9999, UNITS)).toBe('8г');
  });
});

describe('formatTimeRange', () => {
  it('складає проміжок, коли час є', () => {
    expect(formatTimeRange('09:00', '17:30')).toBe('09:00 – 17:30');
  });

  it('мовчить, коли часу немає', () => {
    expect(formatTimeRange('', '')).toBe('');
  });
});
