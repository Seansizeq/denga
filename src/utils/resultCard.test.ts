import { describe, expect, it } from 'vitest';
import {
  getResultCardTierUrl,
  resultValueColor,
  selectResultCardTier,
} from './resultCard';

describe('result card money tiers', () => {
  it('picks the tier from the amount in dollars', () => {
    // Суми з макета: 12 / 67 / 137 / 1089 / 7089. Сто тридцять сім лишається
    // на згорнутій пачці, бо стопки за домовленістю починаються з 200.
    expect(selectResultCardTier(12)).toBe('coins');
    expect(selectResultCardTier(67)).toBe('roll');
    expect(selectResultCardTier(137)).toBe('roll');
    expect(selectResultCardTier(1089)).toBe('pyramid');
    expect(selectResultCardTier(7089)).toBe('pile');
  });

  it('keeps every threshold on the lower step', () => {
    expect(selectResultCardTier(49.99)).toBe('coins');
    expect(selectResultCardTier(50)).toBe('roll');
    expect(selectResultCardTier(199.99)).toBe('roll');
    expect(selectResultCardTier(200)).toBe('stacks');
    expect(selectResultCardTier(999.99)).toBe('stacks');
    expect(selectResultCardTier(1000)).toBe('pyramid');
    expect(selectResultCardTier(4999.99)).toBe('pyramid');
    expect(selectResultCardTier(5000)).toBe('pile');
    expect(selectResultCardTier(1_000_000)).toBe('pile');
  });

  it('leaves the card without art for zero, a loss or a broken number', () => {
    expect(selectResultCardTier(0)).toBeNull();
    expect(selectResultCardTier(-137)).toBeNull();
    expect(selectResultCardTier(Number.NaN)).toBeNull();
    expect(selectResultCardTier(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('builds a public URL for every tier', () => {
    expect(getResultCardTierUrl('coins')).toMatch(/\/result-cards\/money\/coins\.png$/);
    expect(getResultCardTierUrl('roll')).toMatch(/\/result-cards\/money\/roll\.png$/);
    expect(getResultCardTierUrl('stacks')).toMatch(/\/result-cards\/money\/stacks\.png$/);
    expect(getResultCardTierUrl('pyramid')).toMatch(/\/result-cards\/money\/pyramid\.png$/);
    expect(getResultCardTierUrl('pile')).toMatch(/\/result-cards\/money\/pile\.png$/);
  });

  it('colors positive values green and negative values red', () => {
    expect(resultValueColor(1)).toBe('#4cd97b');
    expect(resultValueColor(-1)).toBe('#ff5a63');
    expect(resultValueColor(0)).toBe('#ffffff');
  });
});
