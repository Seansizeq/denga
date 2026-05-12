import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Transaction, Balance, TransactionDraft } from '../types';
import { apiFetch } from '../api/client';
import { normalizeCurrency } from '../utils/currency';

interface TransactionContextType {
  transactions: Transaction[];
  addTransaction: (transaction: TransactionDraft) => Promise<boolean>;
  updateTransaction: (id: string, transaction: TransactionDraft) => Promise<boolean>;
  deleteTransaction: (id: string) => Promise<boolean>;
  balance: Balance;
  isBootstrapping: boolean;
}

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

export const TransactionProvider: React.FC<{
  children: React.ReactNode;
  onReady?: () => void;
}> = ({ children, onReady }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState<Balance>({ total: 0, income: 0, expense: 0 });
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const readyNotifiedRef = useRef(false);

  const notifyReady = useCallback(() => {
    if (readyNotifiedRef.current) return;
    readyNotifiedRef.current = true;
    onReady?.();
  }, [onReady]);

  const fetchTransactions = useCallback(async ({ initial = false }: { initial?: boolean } = {}) => {
    try {
      const response = await apiFetch('/api/transactions');
      if (!response.ok) return;
      const data = await response.json();
      const normalized = Array.isArray(data)
        ? data.map((row) => ({
            ...row,
            currency: normalizeCurrency((row as { currency?: string }).currency),
          }))
        : [];
      setTransactions(normalized);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      if (initial) {
        setIsBootstrapping(false);
        notifyReady();
      }
    }
  }, [notifyReady]);

  const tryParseJson = async (response: Response) => {
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

  useEffect(() => {
    void fetchTransactions({ initial: true });
    // Poll for changes from the bot every 5 seconds
    const interval = window.setInterval(() => {
      void fetchTransactions();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchTransactions]);

  useEffect(() => {
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const expense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    setBalance({
      total: income - expense,
      income,
      expense
    });
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
            currency: normalizeCurrency((newTransaction as { currency?: string }).currency),
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
                  currency: normalizeCurrency((updated as { currency?: string }).currency),
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
      value={{ transactions, addTransaction, updateTransaction, deleteTransaction, balance, isBootstrapping }}
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
