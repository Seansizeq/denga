import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import { useTranslation } from '../i18n/LanguageContext';
import Header from '../components/ui/Header';
import HeroBalance from '../components/ui/HeroBalance';
import QuickActions from '../components/ui/QuickActions';
import RecentTransactions from '../components/ui/RecentTransactions';
import type { RangeFilter } from '../components/ui/RecentTransactions';
import styles from './Dashboard.module.css';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { transactions, deleteTransaction } = useTransactions();
  const [range, setRange] = useState<RangeFilter>('today');

  const inRange = useMemo(() => {
    const now = new Date();
    return (iso: string) => {
      const d = new Date(iso);
      if (range === 'today') return d.toDateString() === now.toDateString();
      if (range === 'week') {
        const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        return diff <= 7;
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

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.fabAdd}
        onClick={() => navigate('/add')}
        aria-label={t('dashboard', 'addTransaction')}
      >
        <Plus size={28} strokeWidth={2.4} />
      </button>

      <div className={styles.content}>
        <Header />

        <HeroBalance
          net={summary.totalNet}
          income={summary.totalIncome}
          expense={summary.totalExpense}
          onOpenDetails={() => navigate('/accounts')}
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
