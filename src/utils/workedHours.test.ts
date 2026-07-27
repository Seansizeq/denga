import { describe, expect, it } from 'vitest';
import { formatWorkedHoursInput, parseWorkedHoursInput } from './workedHours';

describe('worked hours input', () => {
  it('formats decimal storage as base-60 hours and minutes', () => {
    expect(formatWorkedHoursInput(12.5)).toBe('12:30');
    expect(formatWorkedHoursInput(12)).toBe('12:00');
    expect(formatWorkedHoursInput(1.999)).toBe('2:00');
  });

  it('parses colon, dot, and comma as an hours/minutes separator', () => {
    expect(parseWorkedHoursInput('12:30')).toBe(12.5);
    expect(parseWorkedHoursInput('12.30')).toBe(12.5);
    expect(parseWorkedHoursInput('12,30')).toBe(12.5);
    expect(parseWorkedHoursInput('12')).toBe(12);
  });

  it('rejects minutes outside the clock range', () => {
    expect(parseWorkedHoursInput('12:60')).toBeNull();
    expect(parseWorkedHoursInput('12.99')).toBeNull();
    expect(parseWorkedHoursInput('abc')).toBeNull();
  });
});
