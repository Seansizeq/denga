import React, { createContext, useContext, useMemo } from 'react';
import type { Transaction, Balance, TransactionDraft } from '../types';
import { apiFetch } from '../api/client';
import { normalizeDenomination } from '../utils/denomination';
import { useSync } from './SyncContext';

/**
 * Транзакції та дії над ними.
 *
 * Список більше не опитується тут: він приходить зі спільного знімка
 * (`SyncContext`), який робить один запит замість двох і отримує порожній 304,
 * коли нічого не змінилося. Інтерфейс контексту лишився незмінним навмисно —
 * ним користуються десяток екранів, і переписувати їх заради внутрішньої
 * перебудови не було жодної причини.
 */

interface TransactionContextType {
  transactions: Transaction[];
  addTransaction: (transaction: TransactionDraft) => Promise<boolean>;
  updateTransaction: (id: string, transaction: TransactionDraft) => Promise<boolean>;
  deleteTransaction: (id: string) => Promise<boolean>;
  refreshTransactions: () => Promise<void>;
  balance: Balance;
  isBootstrapping: boolean;
  /** true — останній запит не вдався, список показано з кешу. */
  transactionsStale: boolean;
}

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

const normalizeTransaction = (row: unknown): Transaction => {
  const tx = row as Transaction & { currency?: string; transferToCurrency?: string };
  return {
    ...tx,
    currency: normalizeDenomination(tx.currency),
    transferToCurrency: tx.transferToCurrency ? normalizeDenomination(tx.transferToCurrency) : undefined,
  };
};

const tryParseJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const TransactionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { transactions, stale, loaded, refresh, setTransactions } = useSync();

  const balance = useMemo<Balance>(() => {
    let income = 0;
    let expense = 0;
    for (const tx of transactions) {
      if (tx.type === 'income') income += tx.amount;
      else if (tx.type === 'expense') expense += tx.amount;
    }
    return { total: income - expense, income, expense };
  }, [transactions]);

  const value = useMemo<TransactionContextType>(() => {
    /**
     * Свій запис одразу лягає в список, не чекаючи наступного такту. Знімок
     * усе одно приїде й перезапише його канонічним — але до того моменту
     * людина вже бачить те, що щойно зберегла.
     */
    const addTransaction = async (t: TransactionDraft) => {
      try {
        const response = await apiFetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(t),
        });
        if (!response.ok) return false;
        const created = await tryParseJson(response);
        if (created && typeof created === 'object') {
          setTransactions((prev) => [normalizeTransaction(created), ...prev]);
        }
        // Запис зрушив і баланси рахунків — по них знімок потрібен у будь-якому разі.
        void refresh();
        return true;
      } catch (error) {
        console.error('Error adding transaction:', error);
        return false;
      }
    };

    const updateTransaction = async (id: string, t: TransactionDraft) => {
      try {
        const response = await apiFetch(`/api/transactions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(t),
        });
        if (!response.ok) return false;
        const updated = await tryParseJson(response);
        if (updated && typeof updated === 'object') {
          setTransactions((prev) => prev.map((tx) => (tx.id === id ? normalizeTransaction(updated) : tx)));
        }
        void refresh();
        return true;
      } catch (error) {
        console.error('Error updating transaction:', error);
        return false;
      }
    };

    const deleteTransaction = async (id: string) => {
      try {
        const res = await apiFetch(`/api/transactions/${id}`, { method: 'DELETE' });
        if (res.status !== 204 && !res.ok) return false;
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        void refresh();
        return true;
      } catch (error) {
        console.error('Error deleting transaction:', error);
        return false;
      }
    };

    return {
      transactions,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      refreshTransactions: refresh,
      balance,
      isBootstrapping: !loaded,
      transactionsStale: stale,
    };
  }, [transactions, balance, loaded, stale, refresh, setTransactions]);

  return <TransactionContext.Provider value={value}>{children}</TransactionContext.Provider>;
};

export const useTransactions = () => {
  const context = useContext(TransactionContext);
  if (context === undefined) {
    throw new Error('useTransactions must be used within a TransactionProvider');
  }
  return context;
};
