import React from 'react';
import type { Balance } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import styles from './BalanceCard.module.css';

interface BalanceCardProps {
  balance: Balance;
}

const BalanceCard: React.FC<BalanceCardProps> = ({ balance }) => {
  return (
    <div className={styles.card}>
      <span className={styles.label}>Загальний баланс</span>
      <h2 className={styles.amount}>{formatCurrency(balance.total)}</h2>
      
      <div className={styles.summaryRow}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Доходи</span>
          <span className={`${styles.summaryValue} ${styles.income}`}>
            +{formatCurrency(balance.income)}
          </span>
        </div>
        <div className={styles.divider} />
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Витрати</span>
          <span className={`${styles.summaryValue} ${styles.expense}`}>
            -{formatCurrency(balance.expense)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default BalanceCard;
