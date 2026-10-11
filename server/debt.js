import {
  getTransactionAccountEffects,
  resolveEffectDelta,
  resolveEffectDeltaInAccountUnit,
} from './transaction-effects.js';
import { denominationPrecision } from './denomination.js';

const normalizeKey = (value) => String(value ?? '').trim().toLowerCase();
const normalizeUnit = (value) => String(value ?? '').trim().toUpperCase();
const EPSILON = 0.000001;

/**
 * Що можна зробити з боргом, окрім ручної корекції:
 * - `repayment` — борг зменшується: мені повернули або я повернув;
 * - `increase` — борг росте: я позичив ще або взяв ще.
 */
export const DEBT_MOVEMENT_KINDS = ['repayment', 'increase'];

/** Рахунки, через які рухаються гроші боргу. */
const PAYMENT_SECTIONS = ['bank', 'cash'];

const roundTo = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * Перевірка руху боргу перед записом.
 *
 * `amount` — скільки змінюється борг, у його валюті. `paymentAmount` —
 * скільки пройшло через рахунок, у валюті рахунку; потрібен лише тоді, коли
 * валюти різні, і його можна не передавати — тоді він рахується за курсом
 * `convert`. Борг у доларах так можна повернути гривнею: людина бачить, скільки
 * пішло з картки, а борг зменшується на свою суму.
 *
 * `convert(amount, from, to)` повертає `null`, коли курсу немає — тоді рух
 * відхиляється, а не пишеться вигаданим числом.
 */
export const validateDebtMovement = ({
  debtAccount,
  paymentAccount,
  kind = 'repayment',
  amount,
  paymentAmount,
  convert,
}) => {
  if (!DEBT_MOVEMENT_KINDS.includes(kind)) {
    return { ok: false, status: 400, code: 'INVALID_DEBT_MOVEMENT', error: 'kind must be repayment or increase' };
  }
  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return { ok: false, status: 400, code: 'INVALID_AMOUNT', error: 'amount must be positive' };
  }
  if (!debtAccount || debtAccount.section !== 'debt') {
    return { ok: false, status: 404, code: 'DEBT_NOT_FOUND', error: 'debt account not found' };
  }
  const balance = Math.max(0, Number(debtAccount.primaryAmount) || 0);
  if (kind === 'repayment' && normalizedAmount > balance + EPSILON) {
    return {
      ok: false,
      status: 409,
      code: 'DEBT_PAYMENT_EXCEEDS_BALANCE',
      error: 'payment cannot exceed the outstanding balance',
      available: balance,
    };
  }
  if (!paymentAccount || !PAYMENT_SECTIONS.includes(paymentAccount.section)) {
    return {
      ok: false,
      status: 400,
      code: 'PAYMENT_ACCOUNT_REQUIRED',
      error: 'a bank or cash payment account is required',
    };
  }
  const currency = normalizeUnit(debtAccount.primaryCurrency);
  const paymentCurrency = normalizeUnit(paymentAccount.primaryCurrency);
  if (!currency || !paymentCurrency) {
    return {
      ok: false,
      status: 409,
      code: 'PAYMENT_ACCOUNT_CURRENCY_MISMATCH',
      error: 'both accounts need a currency',
    };
  }

  let resolvedPaymentAmount = normalizedAmount;
  if (currency !== paymentCurrency) {
    const given = Number(paymentAmount);
    if (paymentAmount !== undefined && paymentAmount !== null && paymentAmount !== '') {
      if (!Number.isFinite(given) || given <= 0) {
        return { ok: false, status: 400, code: 'INVALID_PAYMENT_AMOUNT', error: 'paymentAmount must be positive' };
      }
      resolvedPaymentAmount = given;
    } else {
      const converted = typeof convert === 'function' ? convert(normalizedAmount, currency, paymentCurrency) : null;
      if (converted === null || converted === undefined || !Number.isFinite(converted) || converted <= 0) {
        return {
          ok: false,
          status: 409,
          code: 'PAYMENT_RATE_UNAVAILABLE',
          error: 'no rate to settle the debt in the payment account currency',
        };
      }
      resolvedPaymentAmount = roundTo(converted, denominationPrecision(paymentCurrency));
    }
  }

  return {
    ok: true,
    kind,
    amount: normalizedAmount,
    currency,
    paymentAmount: resolvedPaymentAmount,
    paymentCurrency,
    debtDirection: debtAccount.debtDirection === 'owed_by_me' ? 'owed_by_me' : 'owed_to_me',
    debtAccountKey: normalizeKey(debtAccount.accountKey),
    paymentAccountKey: normalizeKey(paymentAccount.accountKey),
  };
};

/**
 * Суми руху боргу із суми, набраної в якійсь валюті (форма, бот).
 *
 * - валюта боргу — це сума боргу, а рахунок, якщо в нього інша валюта,
 *   дорахується за курсом;
 * - валюта рахунку — це те, що пройшло через рахунок, а борг зменшиться на
 *   перераховану суму;
 * - третя валюта — борг за курсом, рахунок теж.
 *
 * `null`, коли курсу для потрібного перерахунку немає.
 */
export const resolveDebtMovementAmounts = ({ amount, currency, debtCurrency, paymentCurrency, convert }) => {
  const typed = Number(amount);
  const unit = normalizeUnit(currency);
  const debtUnit = normalizeUnit(debtCurrency);
  const paymentUnit = normalizeUnit(paymentCurrency);
  if (!Number.isFinite(typed) || typed <= 0) return null;
  if (unit === debtUnit) return { amount: typed, paymentAmount: undefined };
  const inDebtUnit = typeof convert === 'function' ? convert(typed, unit, debtUnit) : null;
  if (inDebtUnit === null || inDebtUnit === undefined || !Number.isFinite(inDebtUnit) || inDebtUnit <= 0) return null;
  return {
    amount: roundTo(inDebtUnit, denominationPrecision(debtUnit)),
    paymentAmount: unit === paymentUnit ? typed : undefined,
  };
};

/**
 * Борг, названий у тексті («Михайло повернув 500»). Імена відмінюються, тож
 * порівнюється основа без двох останніх літер. Лише коли збіг один — інакше
 * краще дати людині вибрати, ніж вгадати.
 */
export const pickDebtMentioned = (text, debts) => {
  const haystack = String(text ?? '').toLocaleLowerCase('uk-UA');
  if (!haystack) return null;
  const matches = (debts ?? []).filter((debt) => {
    const name = String(debt?.name ?? '').trim().toLocaleLowerCase('uk-UA');
    if (name.length < 3) return false;
    const stem = name.slice(0, Math.max(3, name.length - 2));
    return haystack.includes(stem);
  });
  return matches.length === 1 ? matches[0] : null;
};

/**
 * Рух боргу як переказ між боргом і рахунком.
 *
 * Сторона боргу завжди у валюті боргу, сторона рахунку — у валюті рахунку,
 * тож баланси нічого не перераховують. Напрямок грошей:
 * - мені винні: повернули — борг → рахунок; позичив ще — рахунок → борг;
 * - я винен: повернув — рахунок → борг; взяв ще — борг → рахунок.
 * Знак зобовʼязання робить решту (див. `resolveEffectDelta`).
 */
export const buildDebtMovementTransfer = ({
  kind = 'repayment',
  debtDirection,
  debtAccountKey,
  paymentAccountKey,
  amount,
  currency,
  paymentAmount = amount,
  paymentCurrency = currency,
}) => {
  const owedByMe = debtDirection === 'owed_by_me';
  const moneyLeavesDebt = kind === 'repayment' ? !owedByMe : owedByMe;
  const debtSide = { key: debtAccountKey, amount, currency };
  const paymentSide = { key: paymentAccountKey, amount: paymentAmount, currency: paymentCurrency };
  const from = moneyLeavesDebt ? debtSide : paymentSide;
  const to = moneyLeavesDebt ? paymentSide : debtSide;
  return {
    type: 'transfer',
    categoryId: kind === 'repayment' ? 'debt_return' : 'debt_lend',
    amount: from.amount,
    currency: from.currency,
    transferToAmount: to.amount,
    transferToCurrency: to.currency,
    fromAccountKey: from.key,
    toAccountKey: to.key,
  };
};

/**
 * На скільки операція зрушила борг — у його одиниці, зі знаком: плюс — борг
 * виріс, мінус — зменшився. `null`, коли операція борг не чіпає або курсу,
 * щоб її перерахувати, немає.
 */
export const debtDeltaOf = (tx, account, convert) => {
  const key = normalizeKey(account?.accountKey);
  let delta = null;
  for (const effect of getTransactionAccountEffects(tx)) {
    if (effect.accountKey !== key) continue;
    const inUnit = convert
      ? resolveEffectDeltaInAccountUnit(effect, account, convert)
      : { ok: true, delta: Number(effect.delta) };
    if (!inUnit.ok) continue;
    delta = (delta ?? 0) + resolveEffectDelta(tx, { ...effect, delta: inUnit.delta }, 1, account);
  }
  return delta;
};

/**
 * Категорія переказу, одна зі сторін якого — борг: `debt_return`, коли борг
 * зменшується, `debt_lend`, коли росте. Так переказ «картка → Михайло» в
 * історії зветься поверненням, а не безликим переказом — як і той, що
 * записаний з картки боргу. Без боргу лишається `transfer`.
 */
export const debtTransferCategoryId = (tx, accountsByKey) => {
  for (const effect of getTransactionAccountEffects(tx)) {
    const account = accountsByKey?.get(effect.accountKey);
    if (account?.section !== 'debt') continue;
    const delta = resolveEffectDelta(tx, effect, 1, account);
    if (delta < 0) return 'debt_return';
    if (delta > 0) return 'debt_lend';
  }
  return 'transfer';
};

const round9 = (value) => roundTo(value, 9);

/**
 * Історія боргу й підсумки для його картки.
 *
 * Рядки — це все, що рухало баланс боргу: стартова сума й ручні корекції
 * (`debt_events`) плюс кожна операція, що його зачепила, хоч би якою дорогою
 * її записали — кнопкою в картці, звичайним переказом, витратою «з боргу».
 * Раніше історія показувала лише записи з категорією «Повернення боргу», і
 * повернення звичайним переказом у ній не було.
 *
 * Підсумки рахуються від поточного балансу, а не від стартової суми, тож
 * сходяться з ним завжди: «усього» = залишок + повернуто + списано.
 *
 * @param {{
 *   account: { accountKey: string, primaryAmount: number, primaryCurrency: string, section: string, debtDirection: string },
 *   events: Array<{ id: string, eventType: string, amount: number, date: string }>,
 *   transactions: object[],
 *   convert?: (amount: number, from: string, to: string) => number | null,
 * }} input
 */
export const buildDebtHistory = ({ account, events = [], transactions = [], convert }) => {
  const key = normalizeKey(account?.accountKey);
  const entries = [];

  for (const event of events) {
    const type = String(event?.eventType ?? '');
    if (type !== 'created' && type !== 'adjustment') continue;
    const amount = Number(event.amount);
    // Нульовий старт — це борг, заведений разом із переказом: гроші показує
    // сам переказ.
    if (!Number.isFinite(amount) || Math.abs(amount) < EPSILON) continue;
    entries.push({
      id: `event:${event.id}`,
      kind: type === 'created' ? 'opening' : 'adjustment',
      date: event.date,
      delta: round9(amount),
      note: null,
      transactionId: null,
      categoryId: null,
      counterpartAccountKey: null,
      managed: false,
    });
  }

  for (const tx of transactions) {
    const delta = debtDeltaOf(tx, account, convert);
    if (delta === null || Math.abs(delta) < EPSILON) continue;
    const counterpart =
      tx.type === 'transfer'
        ? getTransactionAccountEffects(tx).find((effect) => effect.accountKey !== key)?.accountKey ?? null
        : null;
    const isRepayment = delta < 0 && (tx.type === 'transfer' || tx.categoryId === 'debt_return');
    entries.push({
      id: tx.id,
      kind: isRepayment
        ? 'repayment'
        : tx.type === 'transfer'
          ? 'increase'
          : tx.type === 'income'
            ? 'income'
            : 'expense',
      date: tx.date,
      delta: round9(delta),
      note: tx.note ? String(tx.note) : null,
      transactionId: tx.id,
      categoryId: tx.categoryId ?? null,
      counterpartAccountKey: counterpart,
      managed: Boolean(tx.debtEventId),
    });
  }

  // Новіші вгорі; стартова сума — завжди останньою в межах свого моменту.
  entries.sort((a, b) => {
    const byDate = String(b.date).localeCompare(String(a.date));
    if (byDate !== 0) return byDate;
    return (a.kind === 'opening') - (b.kind === 'opening');
  });

  const balance = Math.max(0, Number(account?.primaryAmount) || 0);
  let repaid = 0;
  let writtenOff = 0;
  for (const entry of entries) {
    if (entry.delta >= 0) continue;
    if (entry.kind === 'repayment') repaid += -entry.delta;
    else writtenOff += -entry.delta;
  }
  const total = balance + repaid + writtenOff;

  return {
    currency: normalizeUnit(account?.primaryCurrency),
    debtDirection: account?.debtDirection === 'owed_by_me' ? 'owed_by_me' : 'owed_to_me',
    balance: round9(balance),
    total: round9(total),
    repaid: round9(repaid),
    writtenOff: round9(writtenOff),
    progress: total > 0 ? Math.min(1, (repaid + writtenOff) / total) : 0,
    entries,
  };
};
