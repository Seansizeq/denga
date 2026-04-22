import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatters';
import styles from './HeroBalance.module.css';

interface HeroBalanceProps {
  net: number;
  income: number;
  expense: number;
  onOpenDetails?: () => void;
  locale?: string;
}

const HeroBalance: React.FC<HeroBalanceProps> = ({
  net,
  income,
  expense,
  onOpenDetails,
  locale: localeProp,
}) => {
  const { locale, t, displayCurrency } = useTranslation();
  const lc = localeProp || locale;

  const sign = net < 0 ? '−' : '';
  const ratio = income > 0 ? (net / income) * 100 : 0;
  const ratioStr = `${ratio >= 0 ? '+' : '−'}${Math.abs(ratio).toFixed(2)}%`;

  return (
    <div className={styles.hero}>
      <button
        type="button"
        className={styles.amountButton}
        onClick={onOpenDetails}
      >
        <h1 className={styles.amount}>
          {sign}
          {formatCurrency(Math.abs(net), lc, displayCurrency)}
        </h1>
      </button>
      <p className={styles.tapHint}>{t('balance', 'tapHint')}</p>

      <div className={styles.deltaRow}>
        {income > 0 && (
          <span className={`${styles.delta} ${styles.income}`}>
            +{formatCurrency(Math.abs(income), lc, displayCurrency)}
          </span>
        )}
        {expense > 0 && (
          <span className={`${styles.deltaPill} ${styles.expensePill}`}>
            −{formatCurrency(Math.abs(expense), lc, displayCurrency)}
          </span>
        )}
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
