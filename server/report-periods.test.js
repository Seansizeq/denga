import { describe, expect, it } from 'vitest';
import { daySetQueryBounds, getPreviousFullWeekDaySet, monthQueryBounds } from './report-periods.js';

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

describe('monthQueryBounds', () => {
  it('бере добу запасу з обох боків — зсув поясу ніде не більший за 14 годин', () => {
    expect(monthQueryBounds('2026-09')).toEqual({ from: '2026-08-30', to: '2026-10-03' });
  });

  it('переходить через межу року', () => {
    expect(monthQueryBounds('2026-12')).toEqual({ from: '2026-11-29', to: '2027-01-03' });
    expect(monthQueryBounds('2026-01')).toEqual({ from: '2025-12-30', to: '2026-02-03' });
  });

  it('враховує високосний лютий', () => {
    expect(monthQueryBounds('2028-02').to).toBe('2028-03-03');
  });

  it('межі накривають кожен день місяця з запасом', () => {
    const { from, to } = monthQueryBounds('2026-09');
    // Рядкове порівняння тут те саме, що робить SQL.
    expect(from < '2026-09-01').toBe(true);
    expect(to > '2026-09-30T23:59:59.999Z').toBe(true);
  });

  it('відмовляється від того, що не є місяцем', () => {
    expect(() => monthQueryBounds('2026-13')).toThrow(/не існує/);
    expect(() => monthQueryBounds('2026')).toThrow(/очікується YYYY-MM/);
    expect(() => monthQueryBounds('')).toThrow(/очікується YYYY-MM/);
  });
});

describe('daySetQueryBounds', () => {
  it('накриває кілька наборів одним проміжком', () => {
    const current = new Set(['2026-09-07', '2026-09-08']);
    const previous = new Set(['2026-08-31', '2026-09-01']);
    expect(daySetQueryBounds(current, previous)).toEqual({ from: '2026-08-29', to: '2026-09-10' });
  });

  it('проміжок справді містить кожен день набору', () => {
    const days = ['2026-01-01', '2026-01-15', '2026-01-31'];
    const { from, to } = daySetQueryBounds(days);
    for (const d of days) {
      // Так само, як порівнює SQL: рядково, проти повного ISO з часом.
      expect(from <= d).toBe(true);
      expect(`${d}T23:59:59.999Z` < to).toBe(true);
    }
  });

  it('приймає і масиви, і Set', () => {
    expect(daySetQueryBounds(['2026-05-05'], new Set(['2026-05-06']))).toEqual({
      from: '2026-05-03',
      to: '2026-05-08',
    });
  });

  it('ігнорує сміття серед днів', () => {
    expect(daySetQueryBounds(['не дата', '2026-05-05', ''])).toEqual({ from: '2026-05-03', to: '2026-05-07' });
  });

  it('без жодного дня меж немає', () => {
    expect(daySetQueryBounds()).toBeNull();
    expect(daySetQueryBounds([], new Set())).toBeNull();
    expect(daySetQueryBounds(['сміття'])).toBeNull();
  });
});
