import { useTransactions } from '../context/TransactionContext';
import BalanceCard from '../components/ui/BalanceCard';
import TransactionItem from '../components/ui/TransactionItem';
import styles from './Dashboard.module.css';

const Dashboard: React.FC = () => {
  const { balance, transactions } = useTransactions();
  const recentTransactions = transactions.slice(0, 5);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Denga</h1>
      </header>
      
      <BalanceCard balance={balance} />

      <section className={styles.recentSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Останні операції</h3>
        </div>
        
        <div className={styles.list}>
          {recentTransactions.length === 0 ? (
            <p className={styles.emptyText}>Операцій поки немає</p>
          ) : (
            recentTransactions.map(t => (
              <TransactionItem key={t.id} transaction={t} />
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
