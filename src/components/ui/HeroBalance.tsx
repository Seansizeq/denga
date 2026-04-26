import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatCurrency, type DisplayCurrency } from '../../utils/formatters';
import styles from './HeroBalance.module.css';

interface HeroBalanceProps {
  net: number;
  income: number;
  expense: number;
  onOpenDetails?: () => void;
  locale?: string;
  /** Сума з рахунків (портфель), а не «усі доходи − витрати» */
  wealthMode?: boolean;
  /** В яких одиницях `net` (для коректних ₴ / zł) */
  mainAmountCurrency?: DisplayCurrency;
  /** Додатково показати залишок в іншій валюті, якщо > 0 */
  wealthOther?: { amount: number; currency: 'UAH' | 'PLN' };
}

const HeroBalance: React.FC<HeroBalanceProps> = ({
  net,
  income,
  expense,
  onOpenDetails,
  locale: localeProp,
  wealthMode = false,
  mainAmountCurrency = 'UAH',
  wealthOther,
}) => {
  const { locale, t, displayCurrency } = useTranslation();
  const lc = localeProp || locale;

  const mainFormat: DisplayCurrency = wealthMode
    ? mainAmountCurrency
    : displayCurrency;

  const sign = net < 0 ? '−' : '';
  const ratio = income > 0 ? (net / income) * 100 : 0;
  const ratioStr = `${ratio >= 0 ? '+' : '−'}${Math.abs(ratio).toFixed(2)}%`;

  const otherFormat: DisplayCurrency = wealthOther?.currency === 'PLN' ? 'PLN' : 'UAH';

  return (
    <div className={styles.hero}>
      <button
        type="button"
        className={styles.amountButton}
        onClick={onOpenDetails}
      >
        <h1 className={styles.amount}>
          {sign}
          {formatCurrency(Math.abs(net), lc, mainFormat)}
        </h1>
      </button>
      <p className={styles.tapHint}>{t('balance', 'tapHint')}</p>

      {wealthMode && wealthOther && wealthOther.amount > 0 ? (
        <div className={styles.deltaRow}>
          <span className={styles.wealthOther}>
            {formatCurrency(wealthOther.amount, lc, otherFormat)}
          </span>
        </div>
      ) : null}

      {!wealthMode ? (
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
      ) : null}

    </div>
  );
};

export default HeroBalance;
