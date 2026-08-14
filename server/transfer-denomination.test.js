import { describe, expect, it } from 'vitest';
import {
  collectDebtOverdrafts,
  computeNetDeltas,
  getTransactionAccountEffects,
  validateTransferPayload,
} from './transaction-effects.js';

const accountsMap = (rows) => new Map(rows.map((r) => [r.accountKey, r]));

const transfer = (over = {}) => ({
  type: 'transfer',
  amount: 50,
  currency: 'USDT',
  fromAccountKey: 'binance',
  toAccountKey: 'card',
  transferToAmount: 190,
  transferToCurrency: 'PLN',
  ...over,
});

describe('cross-denomination transfers', () => {
  const accounts = accountsMap([
    { accountKey: 'binance', primaryCurrency: 'USDT' },
    { accountKey: 'card', primaryCurrency: 'PLN' },
    { accountKey: 'card2', primaryCurrency: 'PLN' },
  ]);

  it('accepts a crypto source paired with a fiat destination', () => {
    const result = validateTransferPayload({
      amount: 50,
      currency: 'USDT',
      fromAccountKey: 'binance',
      toAccountKey: 'card',
      transferToAmount: 190,
      transferToCurrency: 'PLN',
      accountsByKey: accounts,
    });
    expect(result).toMatchObject({
      ok: true,
      currency: 'USDT',
      transferToAmount: 190,
      transferToCurrency: 'PLN',
    });
  });

  it('requires an explicit destination amount across denominations', () => {
    const result = validateTransferPayload({
      amount: 50,
      currency: 'USDT',
      fromAccountKey: 'binance',
      toAccountKey: 'card',
      accountsByKey: accounts,
    });
    expect(result).toMatchObject({ ok: false, code: 'TRANSFER_TO_AMOUNT_REQUIRED' });
  });

  it('rejects a source currency that is not what the account holds', () => {
    const result = validateTransferPayload({
      amount: 50,
      currency: 'PLN',
      fromAccountKey: 'binance',
      toAccountKey: 'card',
      transferToAmount: 190,
      transferToCurrency: 'PLN',
      accountsByKey: accounts,
    });
    expect(result).toMatchObject({ ok: false, code: 'TRANSFER_CURRENCY_MISMATCH' });
  });

  it('mirrors the amount when both sides share a denomination', () => {
    const result = validateTransferPayload({
      amount: 200,
      currency: 'PLN',
      fromAccountKey: 'card',
      toAccountKey: 'card2',
      accountsByKey: accounts,
    });
    expect(result).toMatchObject({ ok: true, transferToAmount: 200, transferToCurrency: 'PLN' });
  });

  it('moves the token amount out and the fiat amount in', () => {
    expect(getTransactionAccountEffects(transfer())).toEqual([
      { accountKey: 'binance', delta: -50, currency: 'USDT' },
      { accountKey: 'card', delta: 190, currency: 'PLN' },
    ]);
  });
});

describe('debt balances stay reversible', () => {
  const debtAccounts = accountsMap([
    { accountKey: 'debt', section: 'debt', debtDirection: 'owed_by_me', primaryAmount: 300 },
    { accountKey: 'card', section: 'bank', primaryAmount: 1000 },
  ]);

  const payment = transfer({
    currency: 'PLN',
    amount: 100,
    fromAccountKey: 'card',
    toAccountKey: 'debt',
    transferToAmount: 100,
    transferToCurrency: 'PLN',
  });

  it('reduces a debt I owe when money is paid into it', () => {
    const net = computeNetDeltas([{ tx: payment, multiplier: 1 }], debtAccounts);
    expect(net.get('debt')).toBe(-100);
    expect(net.get('card')).toBe(-100);
    expect(collectDebtOverdrafts(net, debtAccounts)).toEqual([]);
  });

  it('refuses a payment larger than the outstanding debt instead of clamping', () => {
    const overpayment = { ...payment, amount: 5000, transferToAmount: 5000 };
    const net = computeNetDeltas([{ tx: overpayment, multiplier: 1 }], debtAccounts);
    expect(collectDebtOverdrafts(net, debtAccounts)).toEqual([
      { accountKey: 'debt', available: 300, resulting: -4700 },
    ]);
  });

  it('applying then rolling back leaves the balance exactly where it started', () => {
    const net = computeNetDeltas(
      [
        { tx: payment, multiplier: 1 },
        { tx: payment, multiplier: -1 },
      ],
      debtAccounts,
    );
    expect(net.get('debt')).toBe(0);
    expect(net.get('card')).toBe(0);
  });

  it('treats an edit as the net of the rollback and the new value', () => {
    const edited = { ...payment, amount: 250, transferToAmount: 250 };
    const net = computeNetDeltas(
      [
        { tx: payment, multiplier: -1 },
        { tx: edited, multiplier: 1 },
      ],
      debtAccounts,
    );
    // 300 - 250 = 50 left, so the edit is allowed.
    expect(net.get('debt')).toBe(-150);
    expect(collectDebtOverdrafts(net, debtAccounts)).toEqual([]);
  });

  it('blocks an edit that would overshoot the debt', () => {
    const edited = { ...payment, amount: 9000, transferToAmount: 9000 };
    const net = computeNetDeltas(
      [
        { tx: payment, multiplier: -1 },
        { tx: edited, multiplier: 1 },
      ],
      debtAccounts,
    );
    expect(collectDebtOverdrafts(net, debtAccounts)).toHaveLength(1);
  });

  it('only guards debt accounts — an ordinary account may go negative', () => {
    // Drains the card far past zero while paying just 1 into the debt.
    const bigSpend = transfer({
      currency: 'PLN',
      amount: 99999,
      fromAccountKey: 'card',
      toAccountKey: 'debt',
      transferToAmount: 1,
      transferToCurrency: 'PLN',
    });
    const net = computeNetDeltas([{ tx: bigSpend, multiplier: 1 }], debtAccounts);
    expect(net.get('card')).toBe(-99999);
    expect(net.get('debt')).toBe(-1);
    expect(collectDebtOverdrafts(net, debtAccounts)).toEqual([]);
  });
});
