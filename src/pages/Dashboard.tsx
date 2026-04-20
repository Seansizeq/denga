import React from 'react';
import { useTransactions } from '../context/TransactionContext';
import { isSameMonth } from '../utils/formatters';
import Header from '../components/ui/Header';
import BalanceCard from '../components/ui/BalanceCard';
import RecentTransactions from '../components/ui/RecentTransactions';
import AddFab from '../components/ui/AddFab';
import styles from './Dashboard.module.css';

const Dashboard: React.FC = () => {
  const { transactions, deleteTransaction } = useTransactions();

  const monthly = transactions.filter((t) => isSameMonth(t.date));
  const monthIncome = monthly
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const monthExpense = monthly
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <Header />
        <BalanceCard
          balance={{
            total: monthIncome - monthExpense,
            income: monthIncome,
            expense: monthExpense,
          }}
        />
        <RecentTransactions
          transactions={transactions}
          onDelete={deleteTransaction}
        />
        <div className={styles.spacer} />
      </div>
      <AddFab />
    </div>
  );
};

export default Dashboard;
