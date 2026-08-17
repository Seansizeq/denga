import { describe, expect, it } from 'vitest';
import { buildPastDays, isWithinLastDays, localIsoDate } from './dateRanges';

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

describe('localIsoDate', () => {
  it('віддає день, який бачить користувач, а не день за UTC', () => {
    // 00:30 за локальним часом. На схід від Гринвіча цей момент за UTC припадає
    // ще на попередню добу — саме тут `toISOString().slice(0, 10)` і зривався на
    // день назад, через що нічний внесок у ціль лягав учорашньою датою.
    expect(localIsoDate(new Date(2026, 0, 1, 0, 30, 0))).toBe('2026-01-01');
  });

  it('тримає локальний день і в другій половині доби', () => {
    // Дзеркальний випадок: на захід від Гринвіча зривався вже вечір.
    expect(localIsoDate(new Date(2026, 11, 31, 23, 30, 0))).toBe('2026-12-31');
  });

  it('доповнює місяць і день нулем', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
  });

  it('за замовчуванням бере поточний момент', () => {
    expect(localIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
