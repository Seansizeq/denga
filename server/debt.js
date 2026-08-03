const normalizeKey = (value) => String(value ?? '').trim().toLowerCase();

export const validateDebtPayment = ({ debtAccount, paymentAccount, amount }) => {
  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return { ok: false, status: 400, code: 'INVALID_AMOUNT', error: 'amount must be positive' };
  }
  if (!debtAccount || debtAccount.section !== 'debt') {
    return { ok: false, status: 404, code: 'DEBT_NOT_FOUND', error: 'debt account not found' };
  }
  const balance = Math.max(0, Number(debtAccount.primaryAmount) || 0);
  if (normalizedAmount > balance + 0.000001) {
    return {
      ok: false,
      status: 409,
      code: 'DEBT_PAYMENT_EXCEEDS_BALANCE',
      error: 'payment cannot exceed the outstanding balance',
    };
  }
  if (!paymentAccount || !['bank', 'cash'].includes(paymentAccount.section)) {
    return {
      ok: false,
      status: 400,
      code: 'PAYMENT_ACCOUNT_REQUIRED',
      error: 'a bank or cash payment account is required',
    };
  }
  const debtCurrency = String(debtAccount.primaryCurrency ?? '').trim().toUpperCase();
  const paymentCurrency = String(paymentAccount.primaryCurrency ?? '').trim().toUpperCase();
  if (!debtCurrency || debtCurrency !== paymentCurrency) {
    return {
      ok: false,
      status: 409,
      code: 'PAYMENT_ACCOUNT_CURRENCY_MISMATCH',
      error: 'payment account currency must match debt currency',
    };
  }
  return {
    ok: true,
    amount: normalizedAmount,
    currency: debtCurrency,
    debtDirection: debtAccount.debtDirection === 'owed_by_me' ? 'owed_by_me' : 'owed_to_me',
    debtAccountKey: normalizeKey(debtAccount.accountKey),
    paymentAccountKey: normalizeKey(paymentAccount.accountKey),
  };
};

export const buildDebtRepaymentTransfer = ({
  debtDirection,
  debtAccountKey,
  paymentAccountKey,
  amount,
  currency,
}) => {
  const owedByMe = debtDirection === 'owed_by_me';
  return {
    type: 'transfer',
    categoryId: 'debt_return',
    amount,
    currency,
    transferToAmount: amount,
    transferToCurrency: currency,
    fromAccountKey: owedByMe ? paymentAccountKey : debtAccountKey,
    toAccountKey: owedByMe ? debtAccountKey : paymentAccountKey,
  };
};
