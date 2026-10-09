import type { Denomination } from '../utils/denomination';

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface Transaction {
  id: string;
  /** The unit `amount` is counted in — fiat currency or crypto asset. */
  currency: Denomination;
  amount: number;
  categoryId: string;
  type: TransactionType;
  date: string;
  note?: string;
  /** Рахунок доходу чи витрати. У старих записах ще може жити в примітці. */
  accountKey?: string | null;
  /** На скільки операція зрушила рахунок, у його валюті на день запису. */
  accountAmount?: number | null;
  accountCurrency?: Denomination | null;
  fromAccountKey?: string;
  toAccountKey?: string;
  debtEventId?: string;
  transferToAmount?: number;
  transferToCurrency?: Denomination;
}

export interface TransactionDraft {
  amount: number;
  currency: string;
  categoryId: string;
  type: TransactionType;
  date?: string;
  note?: string;
  /** `null` — без рахунку. */
  accountKey?: string | null;
  fromAccountKey?: string;
  toAccountKey?: string;
  transferToAmount?: number;
  transferToCurrency?: string;
}

export interface Balance {
  total: number;
  income: number;
  expense: number;
}
