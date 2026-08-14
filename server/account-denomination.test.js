import { describe, expect, it } from 'vitest';
import {
  collectDenominationMismatches,
  computeNetDeltas,
  resolveEffectDeltaInAccountUnit,
} from './transaction-effects.js';

/** UAH↔PLN only, like a live FX cache; crypto has no price here. */
const convert = (amount, from, to) => {
  if (from === to) return amount;
  const rates = { 'UAH:PLN': 0.1, 'PLN:UAH': 10 };
  const rate = rates[`${from}:${to}`];
  return rate === undefined ? null : amount * rate;
};

describe('account denomination guard', () => {
  it('applies an amount unchanged when the units already match', () => {
    expect(
      resolveEffectDeltaInAccountUnit(
        { accountKey: 'binance', delta: -50, currency: 'USDT' },
        { primaryCurrency: 'USDT' },
        convert,
      ),
    ).toEqual({ ok: true, delta: -50 });
  });

  it('settles a fiat mismatch through the rate and keeps the direction', () => {
    expect(
      resolveEffectDeltaInAccountUnit(
        { accountKey: 'cash', delta: -100, currency: 'UAH' },
        { primaryCurrency: 'PLN' },
        convert,
      ),
    ).toEqual({ ok: true, delta: -10 });
  });

  it('refuses fiat against a crypto balance instead of subtracting it raw', () => {
    // The regression: 2 200 ₴ used to be subtracted from a 70 USDT position.
    expect(
      resolveEffectDeltaInAccountUnit(
        { accountKey: 'binance', delta: -2200, currency: 'UAH' },
        { primaryCurrency: 'USDT' },
        convert,
      ),
    ).toEqual({ ok: false, reason: 'DENOMINATION_MISMATCH' });
  });

  it('reports the mismatch for the endpoint to refuse before writing', () => {
    const accountsByKey = new Map([['binance', { primaryCurrency: 'USDT', section: 'crypto' }]]);
    const entries = [
      {
        tx: { type: 'expense', amount: 2200, currency: 'UAH', note: 'Account: binance' },
        multiplier: 1,
      },
    ];

    expect(collectDenominationMismatches(entries, accountsByKey, convert)).toEqual([
      {
        accountKey: 'binance',
        accountCurrency: 'USDT',
        transactionCurrency: 'UAH',
        reason: 'DENOMINATION_MISMATCH',
      },
    ]);
  });

  it('nets deltas in the account unit, not the transaction unit', () => {
    const accountsByKey = new Map([['cash', { primaryCurrency: 'PLN', section: 'cash' }]]);
    const entries = [
      { tx: { type: 'expense', amount: 100, currency: 'UAH', note: 'Account: cash' }, multiplier: 1 },
    ];

    expect(computeNetDeltas(entries, accountsByKey, convert).get('cash')).toBe(-10);
  });
});
