import React from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { Balance } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { useTranslation } from '../../i18n/LanguageContext';
import styles from './BalanceCard.module.css';

interface BalanceCardProps {
  balance: Balance;
}

const BalanceCard: React.FC<BalanceCardProps> = ({ balance }) => {
  const { t, locale } = useTranslation();
  const net = balance.income - balance.expense;
  const isNegative = net < 0;

  return (
    <div className={styles.card}>
      <span className={styles.label}>{t('balance', 'label')}</span>
      <h2 className={`${styles.amount} ${isNegative ? styles.negative : ''}`}>
        {isNegative ? '−' : ''}
        {formatCurrency(net, locale)}
      </h2>

      <div className={styles.summaryRow}>
        <div className={styles.summaryItem}>
          <div className={`${styles.iconBadge} ${styles.incomeBadge}`}>
            <ArrowDownLeft size={16} />
          </div>
          <div className={styles.summaryText}>
            <span className={styles.summaryLabel}>{t('balance', 'income')}</span>
            <span className={`${styles.summaryValue} ${styles.income}`}>
              {formatCurrency(balance.income, locale)}
            </span>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.summaryItem}>
          <div className={`${styles.iconBadge} ${styles.expenseBadge}`}>
            <ArrowUpRight size={16} />
          </div>
          <div className={styles.summaryText}>
            <span className={styles.summaryLabel}>{t('balance', 'expense')}</span>
            <span className={`${styles.summaryValue} ${styles.expense}`}>
              {formatCurrency(balance.expense, locale)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BalanceCard;
