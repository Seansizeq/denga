import { describe, expect, it } from 'vitest';
import { convertCurrency, fallbackRates, normalizeCurrency } from './currency';

describe('currency utils', () => {
  it('normalizes unsupported currency to UAH', () => {
    expect(normalizeCurrency('eur')).toBe('UAH');
    expect(normalizeCurrency('PLN')).toBe('PLN');
  });

  it('converts between currencies with fallback rates', () => {
    const pln = convertCurrency(39, 'UAH', 'PLN', fallbackRates);
    expect(pln).toBeCloseTo(3.95, 2);
  });

  it('keeps amount for same currency', () => {
    expect(convertCurrency(100, 'USD', 'USD', fallbackRates)).toBe(100);
  });
});
