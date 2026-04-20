import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Transaction, Balance } from '../types';

interface TransactionContextType {
  transactions: Transaction[];
  addTransaction: (transaction: Omit<Transaction, 'id' | 'date'>) => void;
  deleteTransaction: (id: string) => void;
  balance: Balance;
}

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

/** Пустая строка = тот же origin (Vite proxy в dev, Express в prod). Иначе полный URL бэкенда. */
const API_URL = import.meta.env.VITE_API_URL ?? '';

export const TransactionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState<Balance>({ total: 0, income: 0, expense: 0 });

  const fetchTransactions = async () => {
    try {
      const response = await fetch(`${API_URL}/api/transactions`);
      const data = await response.json();
      setTransactions(data);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  useEffect(() => {
    fetchTransactions();
    // Poll for changes from the bot every 5 seconds
    const interval = setInterval(fetchTransactions, 5000);
    return () => clearInterval(interval);
  }, []);

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

  const addTransaction = async (t: Omit<Transaction, 'id' | 'date'>) => {
    try {
      const response = await fetch(`${API_URL}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(t),
      });
      const newTransaction = await response.json();
      setTransactions(prev => [newTransaction, ...prev]);
    } catch (error) {
      console.error('Error adding transaction:', error);
    }
  };

  const deleteTransaction = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/transactions/${id}`, {
        method: 'DELETE',
      });
      setTransactions(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  return (
    <TransactionContext.Provider value={{ transactions, addTransaction, deleteTransaction, balance }}>
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
