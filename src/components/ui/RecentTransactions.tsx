import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Transaction } from '../../types';
import { useTranslation } from '../../i18n/LanguageContext';
import TransactionItem from './TransactionItem';
import styles from './RecentTransactions.module.css';

interface Props {
  transactions: Transaction[];
  limit?: number;
  onDelete?: (id: string) => void;
}

const RecentTransactions: React.FC<Props> = ({ transactions, limit = 5, onDelete }) => {
  const { t } = useTranslation();
  const visible = transactions.slice(0, limit);

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t('dashboard', 'recentTitle')}</h3>
        {transactions.length > 0 && (
          <Link to="/history" className={styles.seeAll}>
            {t('dashboard', 'seeAll')}
            <ChevronRight size={16} />
          </Link>
        )}
      </div>

      {visible.length === 0 ? (
        <div className={styles.emptyState}>
          <span role="img" aria-label="empty" className={styles.emptyIcon}>📒</span>
          <p className={styles.emptyText}>{t('dashboard', 'empty')}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {visible.map((tx) => (
            <TransactionItem
              key={tx.id}
              transaction={tx}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default RecentTransactions;
