import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import { useTranslation } from '../i18n/LanguageContext';
import Header from '../components/ui/Header';
import HeroBalance from '../components/ui/HeroBalance';
import QuickActions from '../components/ui/QuickActions';
import RecentTransactions from '../components/ui/RecentTransactions';
import type { RangeFilter } from '../components/ui/RecentTransactions';
import { apiFetch } from '../api/client';
import { isWithinLastDays } from '../utils/dateRanges';
import styles from './Dashboard.module.css';

type PortfolioWorth = { uah: number; pln: number };

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t, displayCurrency } = useTranslation();
  const { transactions, deleteTransaction } = useTransactions();
  const [range, setRange] = useState<RangeFilter>('today');
  const [worth, setWorth] = useState<PortfolioWorth | null>(null);

  const inRange = useMemo(() => {
    const now = new Date();
    return (iso: string) => {
      const d = new Date(iso);
      if (range === 'today') return d.toDateString() === now.toDateString();
      if (range === 'week') {
        return isWithinLastDays(iso, 7, now);
      }
      if (range === 'month') {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      if (range === 'year') return d.getFullYear() === now.getFullYear();
      return false;
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

    return {
      totalIncome: totals.income,
      totalExpense: totals.expense,
      totalNet: totals.income - totals.expense,
    };
  }, [transactions]);

  const loadWorth = useCallback(async () => {
    try {
      const res = await apiFetch('/api/accounts');
      if (!res.ok) {
        setWorth(null);
        return;
      }
      const data: unknown = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setWorth(null);
        return;
      }
      let uah = 0;
      let pln = 0;
      for (const row of data) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const amt = Number(r.primaryAmount);
        if (!Number.isFinite(amt)) continue;
        if (r.primaryCurrency === 'PLN') pln += amt;
        else uah += amt;
      }
      setWorth({ uah, pln });
    } catch {
      setWorth(null);
    }
  }, []);

  useEffect(() => {
    void loadWorth();
    const id = window.setInterval(() => void loadWorth(), 5000);
    return () => window.clearInterval(id);
  }, [loadWorth]);

  const wealthMode = worth !== null;
  const usePlnMain = displayCurrency === 'PLN';
  const mainNet = wealthMode && worth
    ? (usePlnMain ? worth.pln : worth.uah)
    : summary.totalNet;
  const mainAmountCurrency: 'UAH' | 'PLN' = usePlnMain ? 'PLN' : 'UAH';
  const wealthOther =
    worth && wealthMode
      ? (() => {
          const { uah, pln } = worth;
          if (usePlnMain && uah > 0) return { amount: uah, currency: 'UAH' as const };
          if (!usePlnMain && pln > 0) return { amount: pln, currency: 'PLN' as const };
          return undefined;
        })()
      : undefined;

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.fabAdd}
        onClick={() => navigate('/add')}
        aria-label={t('dashboard', 'addTransaction')}
      >
        <Plus size={34} strokeWidth={2.4} />
      </button>

      <div className={styles.content}>
        <Header />

        <HeroBalance
          net={mainNet}
          income={summary.totalIncome}
          expense={summary.totalExpense}
          onOpenDetails={() => navigate('/accounts')}
          wealthMode={wealthMode}
          mainAmountCurrency={wealthMode ? mainAmountCurrency : 'UAH'}
          wealthOther={wealthMode ? wealthOther : undefined}
        />

        <QuickActions />

        <RecentTransactions
          transactions={filtered}
          onDelete={async (id) => {
            const ok = await deleteTransaction(id);
            if (!ok) window.alert(t('addTx', 'saveFailed'));
          }}
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
