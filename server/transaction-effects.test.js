import { describe, expect, it } from 'vitest';
import {
  getTransactionAccountEffects,
  keepsBooking,
  validateTransferPayload,
  withoutBooking,
} from './transaction-effects.js';

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

describe('записана сума в одиниці рахунку', () => {
  const zlotyOffHryvniaCard = {
    id: 'tx1',
    type: 'expense',
    amount: 100,
    currency: 'PLN',
    categoryId: 'food',
    note: 'Хліб Account: card',
  };

  it('без записаної суми операція рахується у своїй валюті, як і раніше', () => {
    expect(getTransactionAccountEffects(zlotyOffHryvniaCard)).toEqual([
      { accountKey: 'card', delta: -100, currency: 'PLN' },
    ]);
  });

  it('із записаною — знімається рівно та сума, на яку зрушила рахунок', () => {
    // Курс дня відкату вже не має значення: 1 147.48 ₴ і є те, що списали.
    expect(
      getTransactionAccountEffects({ ...zlotyOffHryvniaCard, accountAmount: 1147.48, accountCurrency: 'UAH' }),
    ).toEqual([{ accountKey: 'card', delta: -1147.48, currency: 'UAH' }]);
    expect(
      getTransactionAccountEffects({ ...zlotyOffHryvniaCard, type: 'income', accountAmount: 1147.48, accountCurrency: 'uah' }),
    ).toEqual([{ accountKey: 'card', delta: 1147.48, currency: 'UAH' }]);
  });

  it('переказ записаною сумою не користується — його суми вже у валютах рахунків', () => {
    const transfer = {
      type: 'transfer',
      amount: 100,
      currency: 'UAH',
      fromAccountKey: 'a',
      toAccountKey: 'b',
      transferToAmount: 10,
      transferToCurrency: 'PLN',
      accountAmount: 999,
      accountCurrency: 'UAH',
    };
    expect(getTransactionAccountEffects(transfer)).toEqual([
      { accountKey: 'a', delta: -100, currency: 'UAH' },
      { accountKey: 'b', delta: 10, currency: 'PLN' },
    ]);
  });

  it('правка дати, примітки чи категорії лишає записану суму чинною', () => {
    const booked = { ...zlotyOffHryvniaCard, accountAmount: 1147.48, accountCurrency: 'UAH' };
    expect(keepsBooking(booked, { ...booked, date: '2026-01-01' })).toBe(true);
    expect(keepsBooking(booked, { ...booked, categoryId: 'transport' })).toBe(true);
    expect(keepsBooking(booked, { ...booked, note: 'Батон Account: card' })).toBe(true);
  });

  it('зміна суми, валюти, типу чи рахунку вимагає перерахунку', () => {
    const booked = { ...zlotyOffHryvniaCard, accountAmount: 1147.48, accountCurrency: 'UAH' };
    expect(keepsBooking(booked, { ...booked, amount: 120 })).toBe(false);
    expect(keepsBooking(booked, { ...booked, currency: 'USD' })).toBe(false);
    expect(keepsBooking(booked, { ...booked, type: 'income' })).toBe(false);
    expect(keepsBooking(booked, { ...booked, note: 'Хліб Account: cash' })).toBe(false);
    expect(withoutBooking(booked)).toMatchObject({ accountAmount: null, accountCurrency: null, amount: 100 });
  });
});
