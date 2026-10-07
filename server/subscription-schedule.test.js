import { describe, expect, it } from 'vitest';
import { addSubscriptionCycle, parseIsoDate, rollForwardChargeDate, toIsoDate } from './subscription-schedule.js';

describe('rollForwardChargeDate', () => {
  it('підписка, увімкнена після паузи, переходить на найближчу дату, а не доганяє пропущені місяці', () => {
    expect(rollForwardChargeDate('2026-01-15', 'monthly', '2026-06-10')).toBe('2026-06-15');
  });

  it('якщо найближча дата цього місяця вже минула — наступний місяць', () => {
    expect(rollForwardChargeDate('2026-01-05', 'monthly', '2026-06-10')).toBe('2026-07-05');
  });

  it('сьогоднішня дата лишається: списання сьогодні — чесне значення', () => {
    expect(rollForwardChargeDate('2026-01-10', 'monthly', '2026-06-10')).toBe('2026-06-10');
    expect(rollForwardChargeDate('2026-06-10', 'monthly', '2026-06-10')).toBe('2026-06-10');
  });

  it('майбутня дата не змінюється', () => {
    expect(rollForwardChargeDate('2026-09-01', 'monthly', '2026-06-10')).toBe('2026-09-01');
  });

  it('річна підписка крокує роками', () => {
    expect(rollForwardChargeDate('2024-03-20', 'yearly', '2026-06-10')).toBe('2027-03-20');
  });

  it('31-ше не сповзає на 28-ме після лютого', () => {
    expect(rollForwardChargeDate('2026-01-31', 'monthly', '2026-03-05')).toBe('2026-03-31');
  });

  it('некоректна дата повертається як є — її відсіює валідація', () => {
    expect(rollForwardChargeDate('2026-02-31', 'monthly', '2026-06-10')).toBe('2026-02-31');
  });
});

describe('дати', () => {
  it('parseIsoDate не приймає неіснуючий день', () => {
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(toIsoDate(parseIsoDate('2026-02-28'))).toBe('2026-02-28');
  });

  it('addSubscriptionCycle притискає день до кінця місяця', () => {
    expect(toIsoDate(addSubscriptionCycle(parseIsoDate('2026-01-31'), 'monthly'))).toBe('2026-02-28');
  });
});
