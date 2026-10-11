import { describe, expect, it } from 'vitest';
import {
  buildDebtHistory,
  buildDebtMovementTransfer,
  debtDeltaOf,
  debtTransferCategoryId,
  pickDebtMentioned,
  resolveDebtMovementAmounts,
  validateDebtMovement,
} from './debt.js';
import { computeNetDeltas } from './transaction-effects.js';

const debt = (direction = 'owed_to_me', overrides = {}) => ({
  accountKey: 'debt_anna',
  section: 'debt',
  primaryAmount: 500,
  primaryCurrency: 'PLN',
  debtDirection: direction,
  ...overrides,
});

const cash = {
  accountKey: 'wallet',
  section: 'cash',
  primaryCurrency: 'PLN',
};

const uahCard = { accountKey: 'card', section: 'bank', primaryCurrency: 'UAH' };

// 1 PLN = 10 UAH — досить, щоб бачити, що конвертація справді відбулась.
const convert = (amount, from, to) => {
  if (from === to) return amount;
  if (from === 'PLN' && to === 'UAH') return amount * 10;
  if (from === 'UAH' && to === 'PLN') return amount / 10;
  return null;
};

/** Як рух боргу зсуває баланси: борг і рахунок, кожен у своїй одиниці. */
const balancesAfter = (transfer, debtAccount, paymentAccount) => {
  const accounts = new Map([
    [debtAccount.accountKey, debtAccount],
    [paymentAccount.accountKey, paymentAccount],
  ]);
  return Object.fromEntries(computeNetDeltas([{ tx: transfer, multiplier: 1 }], accounts));
};

describe('validateDebtMovement', () => {
  it('rejects a repayment larger than the remaining balance', () => {
    expect(validateDebtMovement({ debtAccount: debt(), paymentAccount: cash, amount: 501 })).toMatchObject({
      ok: false,
      code: 'DEBT_PAYMENT_EXCEEDS_BALANCE',
      available: 500,
    });
  });

  it('lets a debt grow past its balance — lending more has no ceiling', () => {
    expect(
      validateDebtMovement({ debtAccount: debt(), paymentAccount: cash, amount: 5000, kind: 'increase' }),
    ).toMatchObject({ ok: true, kind: 'increase', amount: 5000 });
  });

  it('refuses an unknown kind', () => {
    expect(
      validateDebtMovement({ debtAccount: debt(), paymentAccount: cash, amount: 10, kind: 'forgive' }),
    ).toMatchObject({ ok: false, code: 'INVALID_DEBT_MOVEMENT' });
  });

  it('requires a bank or cash account', () => {
    expect(
      validateDebtMovement({
        debtAccount: debt(),
        paymentAccount: { accountKey: 'btc', section: 'crypto', primaryCurrency: 'BTC' },
        amount: 10,
      }),
    ).toMatchObject({ ok: false, code: 'PAYMENT_ACCOUNT_REQUIRED' });
    expect(validateDebtMovement({ debtAccount: debt(), paymentAccount: null, amount: 10 })).toMatchObject({
      ok: false,
      code: 'PAYMENT_ACCOUNT_REQUIRED',
    });
  });

  it('settles a debt in another currency at the rate when the account side is not given', () => {
    expect(
      validateDebtMovement({ debtAccount: debt(), paymentAccount: uahCard, amount: 100, convert }),
    ).toMatchObject({ ok: true, amount: 100, currency: 'PLN', paymentAmount: 1000, paymentCurrency: 'UAH' });
  });

  it('keeps the account side the person typed, even if it differs from the rate', () => {
    expect(
      validateDebtMovement({
        debtAccount: debt(),
        paymentAccount: uahCard,
        amount: 100,
        paymentAmount: 1020,
        convert,
      }),
    ).toMatchObject({ ok: true, amount: 100, paymentAmount: 1020 });
  });

  it('refuses a cross-currency movement without a rate rather than guessing', () => {
    expect(
      validateDebtMovement({ debtAccount: debt(), paymentAccount: uahCard, amount: 100, convert: () => null }),
    ).toMatchObject({ ok: false, code: 'PAYMENT_RATE_UNAVAILABLE' });
  });

  it('ignores a stray account amount when both sides share the currency', () => {
    expect(
      validateDebtMovement({ debtAccount: debt(), paymentAccount: cash, amount: 100, paymentAmount: 999 }),
    ).toMatchObject({ ok: true, paymentAmount: 100 });
  });
});

describe('buildDebtMovementTransfer', () => {
  const movement = (direction, kind, paymentAccount = cash) => {
    const validated = validateDebtMovement({
      debtAccount: debt(direction),
      paymentAccount,
      amount: 100,
      kind,
      convert,
    });
    expect(validated.ok).toBe(true);
    return buildDebtMovementTransfer(validated);
  };

  it('a repayment owed to me goes from the debt to cash', () => {
    const transfer = movement('owed_to_me', 'repayment');
    expect(transfer).toMatchObject({
      type: 'transfer',
      categoryId: 'debt_return',
      fromAccountKey: 'debt_anna',
      toAccountKey: 'wallet',
    });
    expect(balancesAfter(transfer, debt('owed_to_me'), cash)).toEqual({ debt_anna: -100, wallet: 100 });
  });

  it('a repayment I make goes from cash into the liability and shrinks it', () => {
    const transfer = movement('owed_by_me', 'repayment');
    expect(transfer).toMatchObject({ categoryId: 'debt_return', fromAccountKey: 'wallet', toAccountKey: 'debt_anna' });
    expect(balancesAfter(transfer, debt('owed_by_me'), cash)).toEqual({ debt_anna: -100, wallet: -100 });
  });

  it('lending more moves money from cash onto the receivable', () => {
    const transfer = movement('owed_to_me', 'increase');
    expect(transfer).toMatchObject({ categoryId: 'debt_lend', fromAccountKey: 'wallet', toAccountKey: 'debt_anna' });
    expect(balancesAfter(transfer, debt('owed_to_me'), cash)).toEqual({ debt_anna: 100, wallet: -100 });
  });

  it('borrowing more grows the liability and brings money in', () => {
    const transfer = movement('owed_by_me', 'increase');
    expect(transfer).toMatchObject({ categoryId: 'debt_lend', fromAccountKey: 'debt_anna', toAccountKey: 'wallet' });
    expect(balancesAfter(transfer, debt('owed_by_me'), cash)).toEqual({ debt_anna: 100, wallet: 100 });
  });

  it('keeps each side in its own currency', () => {
    const transfer = movement('owed_to_me', 'repayment', uahCard);
    expect(transfer).toMatchObject({
      amount: 100,
      currency: 'PLN',
      transferToAmount: 1000,
      transferToCurrency: 'UAH',
    });
    expect(balancesAfter(transfer, debt('owed_to_me'), uahCard)).toEqual({ debt_anna: -100, card: 1000 });
  });
});

describe('debtTransferCategoryId', () => {
  const accounts = new Map([
    ['debt_anna', debt('owed_to_me')],
    ['debt_bob', debt('owed_by_me', { accountKey: 'debt_bob' })],
    ['wallet', cash],
  ]);
  const transfer = (from, to) => ({ type: 'transfer', amount: 50, currency: 'PLN', fromAccountKey: from, toAccountKey: to });

  it('names a plain transfer that shrinks a debt a repayment', () => {
    expect(debtTransferCategoryId(transfer('debt_anna', 'wallet'), accounts)).toBe('debt_return');
    expect(debtTransferCategoryId(transfer('wallet', 'debt_bob'), accounts)).toBe('debt_return');
  });

  it('names a transfer that grows a debt a loan', () => {
    expect(debtTransferCategoryId(transfer('wallet', 'debt_anna'), accounts)).toBe('debt_lend');
    expect(debtTransferCategoryId(transfer('debt_bob', 'wallet'), accounts)).toBe('debt_lend');
  });

  it('leaves a transfer between ordinary accounts alone', () => {
    const more = new Map([...accounts, ['card', uahCard]]);
    expect(debtTransferCategoryId(transfer('wallet', 'card'), more)).toBe('transfer');
  });
});

describe('debtDeltaOf', () => {
  it('reports what an expense paid from a debt I owe did to it — it grew', () => {
    const expense = { type: 'expense', amount: 30, currency: 'PLN', accountKey: 'debt_anna' };
    expect(debtDeltaOf(expense, debt('owed_by_me'))).toBe(30);
  });

  it('keeps the old sign for an operation booked under the old rule', () => {
    const expense = { type: 'expense', amount: 30, currency: 'PLN', accountKey: 'debt_anna', legacyDebtSign: 1 };
    expect(debtDeltaOf(expense, debt('owed_by_me'))).toBe(-30);
  });

  it('is null for an operation that does not touch the debt', () => {
    expect(debtDeltaOf({ type: 'expense', amount: 30, currency: 'PLN', accountKey: 'wallet' }, debt())).toBeNull();
  });
});

describe('buildDebtHistory', () => {
  const events = [
    { id: 'e1', eventType: 'created', amount: 1000, date: '2026-09-01T10:00:00.000Z' },
    { id: 'e2', eventType: 'repayment', amount: 300, date: '2026-09-05T10:00:00.000Z' },
  ];
  const repayment = {
    id: 't1',
    type: 'transfer',
    categoryId: 'debt_return',
    amount: 300,
    currency: 'PLN',
    transferToAmount: 300,
    transferToCurrency: 'PLN',
    fromAccountKey: 'debt_anna',
    toAccountKey: 'wallet',
    date: '2026-09-05T10:00:00.000Z',
    debtEventId: 'e2',
  };
  const lentMore = {
    id: 't2',
    type: 'transfer',
    categoryId: 'transfer',
    amount: 500,
    currency: 'PLN',
    transferToAmount: 500,
    transferToCurrency: 'PLN',
    fromAccountKey: 'wallet',
    toAccountKey: 'debt_anna',
    date: '2026-09-10T10:00:00.000Z',
    note: 'на ремонт',
  };

  it('shows every movement, whichever way it was recorded, newest first', () => {
    const history = buildDebtHistory({
      account: debt('owed_to_me', { primaryAmount: 1200 }),
      events,
      transactions: [repayment, lentMore],
    });
    expect(history.entries.map((e) => [e.kind, e.delta])).toEqual([
      ['increase', 500],
      ['repayment', -300],
      ['opening', 1000],
    ]);
    expect(history.entries[0]).toMatchObject({ note: 'на ремонт', counterpartAccountKey: 'wallet', managed: false });
    expect(history.entries[1]).toMatchObject({ managed: true, transactionId: 't1' });
  });

  it('totals agree with the balance: lending more does not reset the progress', () => {
    const history = buildDebtHistory({
      account: debt('owed_to_me', { primaryAmount: 1200 }),
      events,
      transactions: [repayment, lentMore],
    });
    expect(history).toMatchObject({ balance: 1200, total: 1500, repaid: 300, writtenOff: 0 });
    expect(history.progress).toBeCloseTo(0.2);
  });

  it('counts a downward correction as written off, not as repaid', () => {
    const history = buildDebtHistory({
      account: debt('owed_to_me', { primaryAmount: 800 }),
      events: [...events.slice(0, 1), { id: 'e3', eventType: 'adjustment', amount: -200, date: '2026-09-07T00:00:00.000Z' }],
      transactions: [],
    });
    expect(history).toMatchObject({ total: 1000, repaid: 0, writtenOff: 200 });
  });

  it('hides a zero opening — the funding transfer carries the money', () => {
    const history = buildDebtHistory({
      account: debt('owed_to_me', { primaryAmount: 500 }),
      events: [{ id: 'e0', eventType: 'created', amount: 0, date: '2026-09-10T10:00:00.000Z' }],
      transactions: [lentMore],
    });
    expect(history.entries.map((e) => e.kind)).toEqual(['increase']);
    expect(history).toMatchObject({ total: 500, repaid: 0, progress: 0 });
  });

  it('reads a liability the right way round', () => {
    const repaidInto = { ...repayment, fromAccountKey: 'wallet', toAccountKey: 'debt_anna', debtEventId: null };
    const spentOnCredit = { id: 't3', type: 'expense', amount: 40, currency: 'PLN', accountKey: 'debt_anna', date: '2026-09-06T00:00:00.000Z' };
    const history = buildDebtHistory({
      account: debt('owed_by_me', { primaryAmount: 740 }),
      events: events.slice(0, 1),
      transactions: [repaidInto, spentOnCredit],
    });
    expect(history.entries.map((e) => [e.kind, e.delta])).toEqual([
      ['expense', 40],
      ['repayment', -300],
      ['opening', 1000],
    ]);
    expect(history).toMatchObject({ total: 1040, repaid: 300 });
  });
});

describe('resolveDebtMovementAmounts', () => {
  it('takes a sum typed in the debt currency as the debt side', () => {
    expect(
      resolveDebtMovementAmounts({ amount: 50, currency: 'PLN', debtCurrency: 'PLN', paymentCurrency: 'UAH', convert }),
    ).toEqual({ amount: 50, paymentAmount: undefined });
  });

  it('takes a sum typed in the account currency as what went through the account', () => {
    expect(
      resolveDebtMovementAmounts({ amount: 1000, currency: 'UAH', debtCurrency: 'PLN', paymentCurrency: 'UAH', convert }),
    ).toEqual({ amount: 100, paymentAmount: 1000 });
  });

  it('is null without a rate', () => {
    expect(
      resolveDebtMovementAmounts({ amount: 10, currency: 'USD', debtCurrency: 'PLN', paymentCurrency: 'UAH', convert }),
    ).toBeNull();
  });
});

describe('pickDebtMentioned', () => {
  const debts = [{ name: 'Михайло' }, { name: 'Оля' }, { name: 'Олег' }];

  it('finds a name even when it is inflected', () => {
    expect(pickDebtMentioned('Михайла повернув 500', debts)).toEqual({ name: 'Михайло' });
  });

  it('gives up when the text fits more than one debt', () => {
    expect(pickDebtMentioned('ол повернули', debts)).toBeNull();
    expect(pickDebtMentioned('Олена й Олег повернули', [{ name: 'Олена' }, { name: 'Олег' }])).toBeNull();
  });

  it('is null when nobody is named', () => {
    expect(pickDebtMentioned('повернули борг 500', debts)).toBeNull();
  });
});
