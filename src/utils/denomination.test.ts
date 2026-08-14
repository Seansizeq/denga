import { describe, expect, it } from 'vitest';
import type { FxRatesPayload } from './currency';
import {
  convertDenomination,
  denominationRate,
  isCryptoDenomination,
  normalizeDenomination,
  roundForDenomination,
  type DenominationRates,
} from './denomination';

const fx: FxRatesPayload = {
  base: 'USD',
  rates: { USD: 1, PLN: 4, UAH: 40 },
  updatedAt: new Date(0).toISOString(),
  source: 'fallback',
};

const rates: DenominationRates = { fx, cryptoUsd: { USDT: 1, BTC: 60_000 } };

describe('normalizeDenomination', () => {
  it('keeps crypto assets intact where normalizeCurrency would flatten them', () => {
    expect(normalizeDenomination('USDT')).toBe('USDT');
    expect(normalizeDenomination('btc')).toBe('BTC');
    expect(normalizeDenomination(' eth ')).toBe('ETH');
  });

  it('falls back to hryvnia for anything unrecognised', () => {
    expect(normalizeDenomination('DOGE')).toBe('UAH');
    expect(normalizeDenomination('')).toBe('UAH');
    expect(normalizeDenomination(null)).toBe('UAH');
  });

  it('separates crypto from fiat', () => {
    expect(isCryptoDenomination('USDT')).toBe(true);
    expect(isCryptoDenomination('PLN')).toBe(false);
  });
});

describe('convertDenomination', () => {
  it('routes crypto to fiat through USD', () => {
    expect(convertDenomination(120, 'USDT', 'PLN', rates)).toBe(480);
    expect(convertDenomination(1, 'BTC', 'UAH', rates)).toBe(2_400_000);
  });

  it('routes fiat to crypto', () => {
    expect(convertDenomination(480, 'PLN', 'USDT', rates)).toBe(120);
  });

  it('routes crypto to crypto', () => {
    expect(convertDenomination(60_000, 'USDT', 'BTC', rates)).toBe(1);
  });

  it('still handles plain fiat pairs', () => {
    expect(convertDenomination(40, 'UAH', 'PLN', rates)).toBe(4);
  });

  it('is a no-op for the same denomination', () => {
    expect(convertDenomination(7.5, 'USDT', 'USDT', rates)).toBe(7.5);
  });

  it('returns null rather than inventing a figure when a price is missing', () => {
    expect(convertDenomination(1, 'ETH', 'PLN', rates)).toBe(null);
    expect(convertDenomination(1, 'PLN', 'SOL', rates)).toBe(null);
    expect(convertDenomination(1, 'BTC', 'PLN', { fx, cryptoUsd: { BTC: 0 } })).toBe(null);
    expect(convertDenomination(1, 'BTC', 'PLN', { fx, cryptoUsd: null })).toBe(null);
  });

  it('returns null for a non-finite amount', () => {
    expect(convertDenomination(Number.NaN, 'USDT', 'PLN', rates)).toBe(null);
  });
});

describe('denominationRate', () => {
  it('gives the per-unit rate used to pre-fill a transfer', () => {
    expect(denominationRate('USDT', 'PLN', rates)).toBe(4);
    expect(denominationRate('PLN', 'USDT', rates)).toBe(0.25);
  });

  it('is null when the pair cannot be priced', () => {
    expect(denominationRate('ETH', 'PLN', rates)).toBe(null);
  });
});

describe('roundForDenomination', () => {
  it('keeps enough precision that a small crypto position survives', () => {
    expect(roundForDenomination(0.000123456789, 'BTC')).toBe(0.00012346);
    expect(roundForDenomination(1.23456789, 'ETH')).toBe(1.234568);
  });

  it('rounds fiat to cents', () => {
    expect(roundForDenomination(190.456, 'PLN')).toBe(190.46);
  });
});
