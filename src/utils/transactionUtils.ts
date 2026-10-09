import type { Transaction } from '../types';
import { formatAccountLabel, getTransactionAccountKey, stripAccountFromNote } from './transactionAccount';

export const isIncomeTransaction = (tx: Pick<Transaction, 'type'>): boolean => tx.type === 'income';

export const isExpenseTransaction = (tx: Pick<Transaction, 'type'>): boolean => tx.type === 'expense';

export const isTransferTransaction = (tx: Pick<Transaction, 'type'>): boolean => tx.type === 'transfer';

/** Категорія, під якою записується ручна корекція залишку рахунку. */
export const BALANCE_CORRECTION_CATEGORY_ID = 'balance_correction';

/**
 * Корекція балансу — не дохід і не витрата, а виправлення обліку: гроші не
 * приходили й не йшли, просто цифра в застосунку розійшлася з реальністю.
 * Тому в історії вона лишається (це слід того, що сталося), але в суми
 * доходів/витрат і в статистику за категоріями не потрапляє.
 *
 * На баланс рахунку вона при цьому впливає як звичайний запис: саме так її
 * бачить перерахунок «скільки було на початку місяця», інакше виправлення
 * розбіжності показувалося б як зростання капіталу.
 */
export const isBalanceCorrection = (tx: Pick<Transaction, 'categoryId'>): boolean =>
  tx.categoryId === BALANCE_CORRECTION_CATEGORY_ID;

export const getTransferSourceAccountKey = (tx: Pick<Transaction, 'type' | 'fromAccountKey'>): string | null => {
  if (!isTransferTransaction(tx)) return null;
  const key = String(tx.fromAccountKey ?? '').trim().toLowerCase();
  return key || null;
};

export const getTransferDestinationAccountKey = (tx: Pick<Transaction, 'type' | 'toAccountKey'>): string | null => {
  if (!isTransferTransaction(tx)) return null;
  const key = String(tx.toAccountKey ?? '').trim().toLowerCase();
  return key || null;
};

export type TransactionAccountEffect = {
  accountKey: string;
  delta: number;
  currency: Transaction['currency'];
};

export const getTransactionAccountEffects = (tx: Transaction): TransactionAccountEffect[] => {
  const amount = Number(tx.amount);
  if (!Number.isFinite(amount) || amount <= 0) return [];
  if (isTransferTransaction(tx)) {
    const source = getTransferSourceAccountKey(tx);
    const destination = getTransferDestinationAccountKey(tx);
    const destinationAmount = Number(tx.transferToAmount);
    const destinationCurrency = tx.transferToCurrency ?? tx.currency;
    const normalizedDestinationAmount =
      Number.isFinite(destinationAmount) && destinationAmount > 0 ? destinationAmount : amount;
    return [
      source ? { accountKey: source, delta: -amount, currency: tx.currency } : null,
      destination
        ? { accountKey: destination, delta: normalizedDestinationAmount, currency: destinationCurrency }
        : null,
    ].filter((row): row is TransactionAccountEffect => Boolean(row));
  }

  const accountKey = getTransactionAccountKey(tx);
  if (!accountKey) return [];
  // Те саме правило, що й на сервері (`transaction-effects.js`): операція, що
  // вже зрушила рахунок, рахується тією сумою, на яку зрушила, а не
  // перерахунком за курсом дня.
  const booked = Number(tx.accountAmount);
  const bookedCurrency = String(tx.accountCurrency ?? '').trim().toUpperCase();
  const useBooked = Number.isFinite(booked) && booked > 0 && Boolean(bookedCurrency);
  const size = useBooked ? booked : amount;
  const currency = (useBooked ? bookedCurrency : tx.currency) as Transaction['currency'];
  if (isIncomeTransaction(tx)) {
    return [{ accountKey, delta: size, currency }];
  }
  if (isExpenseTransaction(tx)) {
    return [{ accountKey, delta: -size, currency }];
  }
  return [];
};

export const getTransactionNotePreview = (tx: Pick<Transaction, 'note'>): string => stripAccountFromNote(tx.note?.trim() ?? '');

/**
 * Сума операції у валюті показу — за курсом **її** дня, який сервер записав
 * разом з нею. Без цього вересень у злотих сьогодні був один, а через тиждень
 * інший: гривнева покупка «дешевшала» разом із гривнею. Поки сервер суму ще
 * не порахував (стара операція, курсу дня ще немає), — перерахунок за
 * сьогоднішнім курсом, як було досі.
 *
 * @param fallback перерахунок у валюту показу; `null` — курсу немає.
 */
export const transactionAmountIn = (
  tx: Pick<Transaction, 'amount' | 'currency' | 'amountUah' | 'amountPln' | 'amountUsd'>,
  currency: string,
  fallback: (amount: number, from: Transaction['currency']) => number | null,
): number | null => {
  const stamped =
    currency === 'UAH' ? tx.amountUah : currency === 'PLN' ? tx.amountPln : currency === 'USD' ? tx.amountUsd : null;
  if (typeof stamped === 'number' && Number.isFinite(stamped)) return stamped;
  return fallback(tx.amount, tx.currency);
};

/**
 * `resolveName` дає назви такі, як у гаманці. Без нього лишається розкладений
 * ключ — годиться лише там, де портфель недоступний.
 */
export const getTransferSummaryLabel = (
  tx: Pick<Transaction, 'type' | 'fromAccountKey' | 'toAccountKey'>,
  resolveName: (accountKey?: string | null) => string = formatAccountLabel,
): string => {
  const source = resolveName(getTransferSourceAccountKey(tx));
  const destination = resolveName(getTransferDestinationAccountKey(tx));
  if (!source && !destination) return '';
  if (!source) return destination;
  if (!destination) return source;
  return `${source} → ${destination}`;
};
