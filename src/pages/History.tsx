import { useTransactions } from '../context/TransactionContext';
import TransactionItem from '../components/ui/TransactionItem';
import styles from './Dashboard.module.css';

const History: React.FC = () => {
  const { transactions, deleteTransaction } = useTransactions();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Історія</h1>
      </header>
      
      <div className={styles.list}>
        {transactions.length === 0 ? (
          <p className={styles.emptyText}>Операцій поки немає</p>
        ) : (
          transactions.map(t => (
            <TransactionItem 
              key={t.id} 
              transaction={t} 
              onDelete={deleteTransaction} 
            />
          ))
        )}
      </div>
    </div>
  );
};

export default History;
