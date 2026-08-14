const normalizeAccountKey = (value) => {
  const key = String(value ?? '').trim().toLowerCase();
  return key || null;
};

const getAccountSlugFromNote = (note) => {
  if (typeof note !== 'string' || !note.trim()) return null;
  const m = note.match(/\bAccount:\s*([a-z0-9_]{1,48})\b/i);
  if (!m?.[1]) return null;
  return m[1].toLowerCase();
};

const isTransferType = (value) => value === 'transfer';

export const getTransactionAccountEffects = (tx) => {
  const amount = Number(tx?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return [];

  if (isTransferType(tx?.type)) {
    const fromAccountKey = normalizeAccountKey(tx?.fromAccountKey);
    const toAccountKey = normalizeAccountKey(tx?.toAccountKey);
    const toAmount = Number(tx?.transferToAmount);
    const destinationAmount = Number.isFinite(toAmount) && toAmount > 0 ? toAmount : amount;
    const destinationCurrency = String(tx?.transferToCurrency ?? tx?.currency ?? '')
      .trim()
      .toUpperCase();
    return [
      fromAccountKey ? { accountKey: fromAccountKey, delta: -amount, currency: tx?.currency } : null,
      toAccountKey
        ? {
            accountKey: toAccountKey,
            delta: destinationAmount,
            currency: destinationCurrency || tx?.currency,
          }
        : null,
    ].filter(Boolean);
  }

  const fromKey = normalizeAccountKey(tx?.fromAccountKey);
  // debt_return: payment reduces the debt balance (negative delta)
  if (tx?.categoryId === 'debt_return' && fromKey) {
    return [{ accountKey: fromKey, delta: -amount, currency: tx?.currency }];
  }
  const accountKey = fromKey || getAccountSlugFromNote(tx?.note);
  if (!accountKey) return [];
  if (tx?.type === 'income') return [{ accountKey, delta: amount, currency: tx?.currency }];
  if (tx?.type === 'expense') return [{ accountKey, delta: -amount, currency: tx?.currency }];
  return [];
};

/**
 * Liability balances use the opposite sign to asset balances: paying money into
 * a debt I owe reduces it, while borrowing more increases it.
 */
export const resolveEffectDelta = (tx, effect, multiplier, account) => {
  let delta = effect.delta * multiplier;
  if (tx?.type === 'transfer' && account?.section === 'debt' && account?.debtDirection === 'owed_by_me') {
    delta *= -1;
  }
  return delta;
};

/**
 * Net balance change per account for transactions being applied (multiplier 1)
 * and/or rolled back (-1) together, so an edit can be judged as a single move.
 */
export const computeNetDeltas = (entries, accountsByKey) => {
  const net = new Map();
  for (const { tx, multiplier } of entries) {
    for (const effect of getTransactionAccountEffects(tx)) {
      const account = accountsByKey.get(effect.accountKey);
      const delta = resolveEffectDelta(tx, effect, multiplier, account);
      net.set(effect.accountKey, (net.get(effect.accountKey) ?? 0) + delta);
    }
  }
  return net;
};

const DEBT_EPSILON = 1e-6;

/**
 * Debt accounts must not be driven below zero. Reported before anything is
 * written, so the caller refuses the request instead of clamping the stored
 * value — clamping made applying and un-applying a transaction asymmetric and
 * permanently drifted the balance on every edit or delete.
 */
export const collectDebtOverdrafts = (netDeltas, accountsByKey) => {
  const violations = [];
  for (const [accountKey, delta] of netDeltas) {
    const account = accountsByKey.get(accountKey);
    if (!account || account.section !== 'debt') continue;
    const next = (Number(account.primaryAmount) || 0) + delta;
    if (next < -DEBT_EPSILON) {
      violations.push({ accountKey, available: Number(account.primaryAmount) || 0, resulting: next });
    }
  }
  return violations;
};

export const validateTransferPayload = ({
  amount,
  currency,
  fromAccountKey,
  toAccountKey,
  transferToAmount,
  transferToCurrency,
  accountsByKey,
}) => {
  const normalizedAmount = Number(amount);
  const normalizedFrom = normalizeAccountKey(fromAccountKey);
  const normalizedTo = normalizeAccountKey(toAccountKey);
  const normalizedCurrency = String(currency ?? '').trim().toUpperCase();
  const normalizedToAmount = Number(transferToAmount);
  const normalizedToCurrency = String(transferToCurrency ?? '').trim().toUpperCase();
  if (!(normalizedAmount > 0)) {
    return { ok: false, status: 400, code: 'INVALID_AMOUNT', error: 'amount must be > 0' };
  }
  if (!normalizedFrom || !normalizedTo) {
    return {
      ok: false,
      status: 400,
      code: 'TRANSFER_ACCOUNT_REQUIRED',
      error: 'fromAccountKey and toAccountKey are required',
    };
  }
  if (normalizedFrom === normalizedTo) {
    return {
      ok: false,
      status: 400,
      code: 'TRANSFER_SAME_ACCOUNT',
      error: 'source and destination must differ',
    };
  }

  const fromAccount = accountsByKey.get(normalizedFrom);
  const toAccount = accountsByKey.get(normalizedTo);
  if (!fromAccount || !toAccount) {
    return {
      ok: false,
      status: 400,
      code: 'TRANSFER_ACCOUNT_NOT_FOUND',
      error: 'selected accounts were not found',
    };
  }

  const fromCurrency = String(fromAccount.primaryCurrency ?? '').trim().toUpperCase();
  const toCurrency = String(toAccount.primaryCurrency ?? '').trim().toUpperCase();
  if (!fromCurrency || !toCurrency) {
    return {
      ok: false,
      status: 400,
      code: 'TRANSFER_CURRENCY_MISMATCH',
      error: 'account currencies are required',
    };
  }

  if (normalizedCurrency && normalizedCurrency !== fromCurrency) {
    return {
      ok: false,
      status: 400,
      code: 'TRANSFER_CURRENCY_MISMATCH',
      error: 'transfer currency must match source account currency',
    };
  }

  if (normalizedToCurrency && normalizedToCurrency !== toCurrency) {
    return {
      ok: false,
      status: 400,
      code: 'TRANSFER_CURRENCY_MISMATCH',
      error: 'transfer target currency must match destination account currency',
    };
  }

  if (fromCurrency === toCurrency) {
    return {
      ok: true,
      fromAccountKey: normalizedFrom,
      toAccountKey: normalizedTo,
      currency: fromCurrency,
      transferToAmount: normalizedAmount,
      transferToCurrency: toCurrency,
    };
  }

  if (!(normalizedToAmount > 0)) {
    return {
      ok: false,
      status: 400,
      code: 'TRANSFER_TO_AMOUNT_REQUIRED',
      error: 'transferToAmount must be > 0 for cross-currency transfers',
    };
  }

  return {
    ok: true,
    fromAccountKey: normalizedFrom,
    toAccountKey: normalizedTo,
    currency: fromCurrency,
    transferToAmount: normalizedToAmount,
    transferToCurrency: toCurrency,
  };
};
