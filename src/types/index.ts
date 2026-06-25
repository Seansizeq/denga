export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface Transaction {
  id: string;
  amount: number;
  currency: string;
  categoryId: string;
  type: TransactionType;
  date: string;
  note?: string;
  fromAccountKey?: string;
  toAccountKey?: string;
  transferToAmount?: number;
  transferToCurrency?: string;
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
