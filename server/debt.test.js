import { describe, expect, it } from 'vitest';
import { buildDebtRepaymentTransfer, validateDebtPayment } from './debt.js';

const debt = (direction = 'owed_to_me') => ({
  accountKey: 'debt_anna',
  section: 'debt',
  primaryAmount: 500,
  primaryCurrency: 'PLN',
  debtDirection: direction,
});

const cash = {
  accountKey: 'wallet',
  section: 'cash',
  primaryCurrency: 'PLN',
};

describe('debt repayments', () => {
  it('rejects a repayment larger than the remaining balance', () => {
    expect(validateDebtPayment({ debtAccount: debt(), paymentAccount: cash, amount: 501 })).toMatchObject({
      ok: false,
      code: 'DEBT_PAYMENT_EXCEEDS_BALANCE',
    });
  });

  it('requires a bank or cash account in the same currency', () => {
    expect(
      validateDebtPayment({
        debtAccount: debt(),
        paymentAccount: { ...cash, primaryCurrency: 'UAH' },
        amount: 100,
      }),
    ).toMatchObject({ ok: false, code: 'PAYMENT_ACCOUNT_CURRENCY_MISMATCH' });
  });

  it('moves a repayment owed to me from the debt to cash', () => {
    const validated = validateDebtPayment({ debtAccount: debt(), paymentAccount: cash, amount: 100 });
    expect(validated.ok).toBe(true);
    expect(buildDebtRepaymentTransfer(validated)).toMatchObject({
      type: 'transfer',
      categoryId: 'debt_return',
      fromAccountKey: 'debt_anna',
      toAccountKey: 'wallet',
    });
  });

  it('moves a repayment I make from cash to the liability debt', () => {
    const validated = validateDebtPayment({
      debtAccount: debt('owed_by_me'),
      paymentAccount: cash,
      amount: 100,
    });
    expect(validated.ok).toBe(true);
    expect(buildDebtRepaymentTransfer(validated)).toMatchObject({
      type: 'transfer',
      categoryId: 'debt_return',
      fromAccountKey: 'wallet',
      toAccountKey: 'debt_anna',
    });
  });
});
