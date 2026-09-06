import { describe, expect, it } from 'vitest';
import { MAX_BACKOFF_MS, POLL_INTERVAL_MS, backoffDelayMs } from './backoff';

/** Найгірший випадок розкиду: верхня межа діапазону. */
const worst = (failures: number) => backoffDelayMs(failures, () => 1);
/** Найкращий: нижня межа. */
const best = (failures: number) => backoffDelayMs(failures, () => 0);

describe('backoffDelayMs', () => {
  it('росте з кожною невдачею', () => {
    expect(worst(1)).toBeLessThan(worst(2));
    expect(worst(2)).toBeLessThan(worst(3));
    expect(worst(3)).toBeLessThan(worst(4));
  });

  it('має стелю — далі відступати нема сенсу', () => {
    expect(worst(20)).toBe(MAX_BACKOFF_MS);
    expect(worst(100)).toBe(MAX_BACKOFF_MS);
  });

  it('ніколи не відступає агресивніше за звичайний такт', () => {
    for (let f = 1; f <= 30; f += 1) {
      expect(best(f)).toBeGreaterThanOrEqual(POLL_INTERVAL_MS);
    }
  });

  it('розкидає спроби по діапазону, а не збирає в одну мить', () => {
    // Заради цього все й робиться: клієнти, що впали разом (кожен деплой),
    // мають повернутися рівномірно, а не однією хвилею.
    const delays = new Set(Array.from({ length: 50 }, (_, i) => backoffDelayMs(5, () => i / 50)));
    expect(delays.size).toBeGreaterThan(40);
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(POLL_INTERVAL_MS);
    expect(Math.max(...delays)).toBeLessThanOrEqual(MAX_BACKOFF_MS);
  });

  it('перша невдача не дає стрибка — це може бути випадковий збій', () => {
    expect(worst(1)).toBe(POLL_INTERVAL_MS);
  });

  it('терпить безглузді значення', () => {
    expect(backoffDelayMs(0, () => 1)).toBe(POLL_INTERVAL_MS);
    expect(backoffDelayMs(-5, () => 1)).toBe(POLL_INTERVAL_MS);
    expect(backoffDelayMs(2.7, () => 1)).toBe(worst(2));
  });
});
