import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatters';
import styles from '../../pages/Stats.module.css';

interface StatsSummaryStripProps {
  income: number;
  expense: number;
  net: number;
}

const StatsSummaryStrip: React.FC<StatsSummaryStripProps> = ({ income, expense, net }) => {
  const { t, locale, displayCurrency, moneyHidden } = useTranslation();


  return (
    <>
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('stats', 'totalIncome')}</span>
          <span className={`${styles.summaryValue} ${styles.income}`}>
            {formatCurrency(income, locale, displayCurrency)}
          </span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('stats', 'totalExpense')}</span>
          <span className={`${styles.summaryValue} ${styles.expense}`}>
            {formatCurrency(expense, locale, displayCurrency)}
          </span>
        </div>
      </div>

      <div className={styles.netCard}>
        <span className={styles.summaryLabel}>{t('stats', 'net')}</span>
        <div className={styles.netRight}>
          <span className={`${styles.netValue} ${net < 0 ? styles.negative : styles.positive}`}>
            {moneyHidden ? '' : net < 0 ? '−' : '+'}
            {formatCurrency(net, locale, displayCurrency)}
          </span>
        </div>
      </div>
    </>
  );
};

export default StatsSummaryStrip;
