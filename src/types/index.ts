export type TransactionType = 'income' | 'expense';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface Transaction {
  id: string;
  amount: number;
  currency: 'UAH' | 'PLN' | 'USD';
  categoryId: string;
  type: TransactionType;
  date: string;
  note?: string;
}

export interface TransactionDraft {
  amount: number;
  currency: Transaction['currency'];
  categoryId: string;
  type: TransactionType;
  date?: string;
  note?: string;
}

export interface Balance {
  total: number;
  income: number;
  expense: number;
}
