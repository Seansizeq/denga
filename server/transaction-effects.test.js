import { describe, expect, it } from 'vitest';
import { getTransactionAccountEffects, validateTransferPayload } from './transaction-effects.js';

describe('transaction-effects', () => {
  it('creates source and destination effects for cross-currency transfers', () => {
    expect(
      getTransactionAccountEffects({
        type: 'transfer',
        amount: 100,
        currency: 'UAH',
        fromAccountKey: 'wallet',
        toAccountKey: 'pumb',
        transferToAmount: 10,
        transferToCurrency: 'PLN',
      })
    ).toEqual([
      { accountKey: 'wallet', delta: -100, currency: 'UAH' },
      { accountKey: 'pumb', delta: 10, currency: 'PLN' },
    ]);
  });

  it('validates exchange transfers against account currencies', () => {
    const accountsByKey = new Map([
      ['wallet', { primaryCurrency: 'UAH' }],
      ['pumb', { primaryCurrency: 'PLN' }],
    ]);

    expect(
      validateTransferPayload({
        amount: 100,
        currency: 'UAH',
        fromAccountKey: 'wallet',
        toAccountKey: 'pumb',
        transferToAmount: 10,
        transferToCurrency: 'PLN',
        accountsByKey,
      })
    ).toMatchObject({
      ok: true,
      fromAccountKey: 'wallet',
      toAccountKey: 'pumb',
      transferToAmount: 10,
      transferToCurrency: 'PLN',
    });
  });

  it('rejects transfers when destination amount is missing for exchange', () => {
    const accountsByKey = new Map([
      ['wallet', { primaryCurrency: 'UAH' }],
      ['pumb', { primaryCurrency: 'PLN' }],
    ]);

    expect(
      validateTransferPayload({
        amount: 100,
        currency: 'UAH',
        fromAccountKey: 'wallet',
        toAccountKey: 'pumb',
        accountsByKey,
      })
    ).toMatchObject({
      ok: false,
      code: 'TRANSFER_TO_AMOUNT_REQUIRED',
    });
  });
});
