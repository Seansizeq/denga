import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n/LanguageContext';
import styles from './HeroBalance.module.css';

interface HeroBalanceProps {
  net: number;
  income: number;
  expense: number;
  locale?: string;
}

const formatAmount = (amount: number, locale: string) => {
  return Math.abs(amount).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const HeroBalance: React.FC<HeroBalanceProps> = ({ net, income, expense, locale: localeProp }) => {
  const { locale, t } = useTranslation();
  const lc = localeProp || locale;

  const sign = net < 0 ? '−' : '';
  const ratio = income > 0 ? (net / income) * 100 : 0;
  const ratioStr = `${ratio >= 0 ? '+' : '−'}${Math.abs(ratio).toFixed(2)}%`;

  return (
    <div className={styles.hero}>
      <h1 className={styles.amount}>
        <span className={styles.currency}>₴</span>
        {sign}
        {formatAmount(net, lc)}
      </h1>

      <div className={styles.deltaRow}>
        {income > 0 && (
          <span className={`${styles.delta} ${styles.income}`}>
            +₴{formatAmount(income, lc)}
          </span>
        )}
        {expense > 0 && (
          <span className={`${styles.deltaPill} ${styles.expensePill}`}>
            −₴{formatAmount(expense, lc)}
          </span>
        )}
        <Link to="/history" className={styles.historyButton}>
          {t('history', 'title')}
        </Link>
        {income > 0 && (
          <span
            className={`${styles.deltaPill} ${ratio >= 0 ? styles.positivePill : styles.negativePill}`}
          >
            {ratioStr}
          </span>
        )}
      </div>
    </div>
  );
};

export default HeroBalance;
