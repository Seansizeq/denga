import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTransactions } from '../context/TransactionContext';
import Header from '../components/ui/Header';
import HeroBalance from '../components/ui/HeroBalance';
import QuickActions from '../components/ui/QuickActions';
import RecentTransactions from '../components/ui/RecentTransactions';
import type { RangeFilter } from '../components/ui/RecentTransactions';
import { getCustomCategoryName } from '../constants/categories';
import { translations, type CategoryKey } from '../i18n/translations';
import styles from './Dashboard.module.css';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { transactions, deleteTransaction } = useTransactions();
  const [range, setRange] = useState<RangeFilter>('today');

  const inRange = useMemo(() => {
    const now = new Date();
    return (iso: string) => {
      const d = new Date(iso);
      if (range === 'all') return true;
      if (range === 'today') return d.toDateString() === now.toDateString();
      if (range === 'week') {
        const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        return diff <= 7;
      }
      if (range === 'month') {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      return true;
    };
  }, [range]);

  const filtered = useMemo(
    () => transactions.filter((tx) => inRange(tx.date)),
    [transactions, inRange],
  );

  const summary = useMemo(() => {
    const totals = transactions.reduce(
      (acc, tx) => {
        if (tx.type === 'income') acc.income += tx.amount;
        else acc.expense += tx.amount;
        return acc;
      },
      { income: 0, expense: 0 },
    );

    const categoryLabel = (id: string) => {
      const builtIn = translations.ru.categories[id as CategoryKey];
      if (builtIn) return builtIn;
      return getCustomCategoryName(id) ?? id;
    };

    const sourceMap = new Map<string, { id: string; label: string; amount: number; count: number }>();
    transactions
      .filter((tx) => tx.type === 'income')
      .forEach((tx) => {
        const key = tx.categoryId;
        const current = sourceMap.get(key) ?? {
          id: key,
          label: categoryLabel(key),
          amount: 0,
          count: 0,
        };
        current.amount += tx.amount;
        current.count += 1;
        sourceMap.set(key, current);
      });

    const currencyFromNote = (note?: string): string => {
      if (!note) return 'UAH';
      const match = note.match(/Currency:\s*([A-Za-z#0-9_-]+)/i);
      return match?.[1]?.toUpperCase() ?? 'UAH';
    };

    const currencyMap = new Map<string, number>();
    transactions.forEach((tx) => {
      const currency = currencyFromNote(tx.note);
      const sign = tx.type === 'income' ? 1 : -1;
      currencyMap.set(currency, (currencyMap.get(currency) ?? 0) + sign * tx.amount);
    });

    return {
      totalIncome: totals.income,
      totalExpense: totals.expense,
      totalNet: totals.income - totals.expense,
      sources: Array.from(sourceMap.values()).sort((a, b) => b.amount - a.amount),
      byCurrency: Array.from(currencyMap.entries())
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    };
  }, [transactions]);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <Header />

        <HeroBalance
          net={summary.totalNet}
          income={summary.totalIncome}
          expense={summary.totalExpense}
          sources={summary.sources}
          byCurrency={summary.byCurrency}
        />

        <QuickActions />

        <RecentTransactions
          transactions={filtered}
          onDelete={deleteTransaction}
          onEdit={(id) => navigate(`/add?edit=${id}`)}
          filter={range}
          onFilterChange={setRange}
          showSeeAll
        />

        <div className={styles.spacer} />
      </div>
    </div>
  );
};

export default Dashboard;
