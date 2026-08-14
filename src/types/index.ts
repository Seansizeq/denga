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
