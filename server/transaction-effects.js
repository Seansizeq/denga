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

export const BALANCE_CORRECTION_CATEGORY_ID = 'balance_correction';

/**
 * Ручна корекція залишку. Це не дохід і не витрата, а виправлення обліку, тож
 * вона не рухає баланс (баланс уже виставлено напряму) і не потрапляє в суми
 * доходів/витрат у звітах.
 */
export const isBalanceCorrection = (tx) => tx?.categoryId === BALANCE_CORRECTION_CATEGORY_ID;

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
export const computeNetDeltas = (entries, accountsByKey, convert) => {
  const net = new Map();
  for (const { tx, multiplier } of entries) {
    for (const effect of getTransactionAccountEffects(tx)) {
      const account = accountsByKey.get(effect.accountKey);
      // Deltas are compared against a stored balance, so they must first be
      // expressed in that balance's own unit.
      const inAccountUnit = convert
        ? resolveEffectDeltaInAccountUnit(effect, account, convert)
        : { ok: true, delta: Number(effect.delta) };
      if (!inAccountUnit.ok) continue;
      const delta = resolveEffectDelta(tx, { ...effect, delta: inAccountUnit.delta }, multiplier, account);
      net.set(effect.accountKey, (net.get(effect.accountKey) ?? 0) + delta);
    }
  }
  return net;
};

/**
 * An effect is denominated in the transaction's unit, the balance in the
 * account's own. Applying one to the other unconverted is how a 2 200 ₴
 * transfer subtracted 2 200 from a 70 USDT position: the number was simply
 * added, and nothing compared the two units.
 *
 * Fiat differences settle through FX, which is what every report already does.
 * A crypto/fiat mismatch is refused instead of priced: turning hryvnias into a
 * token position at today's rate would silently invent how much of the asset
 * was actually sold. The Add screen already records that properly as a
 * transfer with both sides stated.
 *
 * Returns `{ ok: true, delta }` or `{ ok: false, reason }`.
 */
export const resolveEffectDeltaInAccountUnit = (effect, account, convert) => {
  const effectUnit = String(effect?.currency ?? '').trim().toUpperCase();
  const accountUnit = String(account?.primaryCurrency ?? '').trim().toUpperCase();
  const delta = Number(effect?.delta);
  if (!Number.isFinite(delta)) return { ok: false, reason: 'INVALID_AMOUNT' };
  // Unknown account or unit: nothing to reconcile against, behave as before.
  if (!accountUnit || !effectUnit || effectUnit === accountUnit) return { ok: true, delta };

  const converted = convert(Math.abs(delta), effectUnit, accountUnit);
  if (converted === null || !Number.isFinite(converted)) {
    return { ok: false, reason: 'DENOMINATION_MISMATCH' };
  }
  return { ok: true, delta: delta < 0 ? -converted : converted };
};

/**
 * Mismatches that cannot be settled, reported before anything is written so the
 * request is refused instead of corrupting a balance.
 */
export const collectDenominationMismatches = (entries, accountsByKey, convert) => {
  const violations = [];
  for (const { tx } of entries) {
    for (const effect of getTransactionAccountEffects(tx)) {
      const account = accountsByKey.get(effect.accountKey);
      if (!account) continue;
      const resolved = resolveEffectDeltaInAccountUnit(effect, account, convert);
      if (resolved.ok) continue;
      violations.push({
        accountKey: effect.accountKey,
        accountCurrency: String(account.primaryCurrency ?? '').toUpperCase(),
        transactionCurrency: String(effect.currency ?? '').toUpperCase(),
        reason: resolved.reason,
      });
    }
  }
  return violations;
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
