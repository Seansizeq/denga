import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Transaction, Balance, TransactionDraft } from '../types';
import { apiFetch } from '../api/client';
import { normalizeDenomination } from '../utils/denomination';
import { usePersistedState } from '../hooks/usePersistedState';
import { usePolling } from '../hooks/usePolling';

const TRANSACTIONS_STORAGE_KEY = 'denga_transactions_v1';
const TRANSACTIONS_POLL_MS = 5000;

const isTransactionArray = (v: unknown): v is Transaction[] =>
  Array.isArray(v) &&
  v.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      typeof (item as Transaction).id === 'string' &&
      typeof (item as Transaction).amount === 'number',
  );

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

export const TransactionProvider: React.FC<{
  children: React.ReactNode;
  onReady?: () => void;
}> = ({ children, onReady }) => {
  const [transactions, setTransactions] = usePersistedState<Transaction[]>(
    TRANSACTIONS_STORAGE_KEY,
    [],
    { validate: isTransactionArray },
  );
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [transactionsStale, setTransactionsStale] = useState(false);
  const readyNotifiedRef = useRef(false);

  const notifyReady = useCallback(() => {
    if (readyNotifiedRef.current) return;
    readyNotifiedRef.current = true;
    onReady?.();
  }, [onReady]);

  const fetchTransactions = useCallback(async ({ initial = false }: { initial?: boolean } = {}) => {
    try {
      const response = await apiFetch('/api/transactions');
      if (!response.ok) throw new Error(`transactions ${response.status}`);
      const data = await response.json();
      const normalized = Array.isArray(data)
        ? data.map((row) => ({
            ...row,
            currency: normalizeDenomination((row as { currency?: string }).currency),
            transferToCurrency: (row as { transferToCurrency?: string }).transferToCurrency
              ? normalizeDenomination((row as { transferToCurrency?: string }).transferToCurrency)
              : undefined,
          }))
        : [];
      setTransactions(normalized);
      setTransactionsStale(false);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      // Кеш лишається видимим, але позначеним — див. банер стану даних.
      setTransactionsStale(true);
    } finally {
      if (initial) {
        setIsBootstrapping(false);
        notifyReady();
      }
    }
  }, [notifyReady, setTransactions]);

  const tryParseJson = async (response: Response) => {
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

  const hasHydratedTransactionsRef = useRef(transactions.length > 0);

  useEffect(() => {
    if (hasHydratedTransactionsRef.current) {
      setIsBootstrapping(false);
      notifyReady();
    }
    void fetchTransactions({ initial: true });
  }, [fetchTransactions, notifyReady]);

  // Транзакції можуть прилетіти з бота, тож список підтягується сам —
  // але лише поки застосунок на екрані.
  const pollTransactions = useCallback(() => {
    void fetchTransactions();
  }, [fetchTransactions]);
  usePolling(pollTransactions, TRANSACTIONS_POLL_MS);

  const balance = useMemo<Balance>(() => {
    let income = 0;
    let expense = 0;
    for (const tx of transactions) {
      if (tx.type === 'income') income += tx.amount;
      else if (tx.type === 'expense') expense += tx.amount;
    }
    return { total: income - expense, income, expense };
  }, [transactions]);

  const addTransaction = async (t: TransactionDraft) => {
    try {
      const response = await apiFetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(t),
      });
      if (!response.ok) return false;
      const newTransaction = await tryParseJson(response);
      if (newTransaction && typeof newTransaction === 'object') {
        setTransactions((prev) => [
          {
            ...(newTransaction as Transaction),
            currency: normalizeDenomination((newTransaction as { currency?: string }).currency),
            transferToCurrency: (newTransaction as { transferToCurrency?: string }).transferToCurrency
              ? normalizeDenomination((newTransaction as { transferToCurrency?: string }).transferToCurrency)
              : undefined,
          },
          ...prev,
        ]);
      } else {
        await fetchTransactions();
      }
      return true;
    } catch (error) {
      console.error('Error adding transaction:', error);
      return false;
    }
  };

  const deleteTransaction = async (id: string) => {
    try {
      const res = await apiFetch(`/api/transactions/${id}`, {
        method: 'DELETE',
      });
      if (res.status !== 204 && !res.ok) return false;
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      return true;
    } catch (error) {
      console.error('Error deleting transaction:', error);
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
        setTransactions((prev) =>
          prev.map((tx) =>
            tx.id === id
              ? {
                  ...(updated as Transaction),
                  currency: normalizeDenomination((updated as { currency?: string }).currency),
                  transferToCurrency: (updated as { transferToCurrency?: string }).transferToCurrency
                    ? normalizeDenomination((updated as { transferToCurrency?: string }).transferToCurrency)
                    : undefined,
                }
              : tx
          )
        );
      } else {
        await fetchTransactions();
      }
      return true;
    } catch (error) {
      console.error('Error updating transaction:', error);
      return false;
    }
  };

  return (
    <TransactionContext.Provider
      value={{
        transactions,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        refreshTransactions: fetchTransactions,
        balance,
        isBootstrapping,
        transactionsStale,
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
};

export const useTransactions = () => {
  const context = useContext(TransactionContext);
  if (context === undefined) {
    throw new Error('useTransactions must be used within a TransactionProvider');
  }
  return context;
};
