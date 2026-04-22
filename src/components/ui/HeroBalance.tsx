import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatters';
import styles from './HeroBalance.module.css';

interface HeroBalanceProps {
  net: number;
  income: number;
  expense: number;
  sources: Array<{ id: string; label: string; amount: number; count: number }>;
  byCurrency: Array<{ currency: string; amount: number }>;
  locale?: string;
}

const HeroBalance: React.FC<HeroBalanceProps> = ({
  net,
  income,
  expense,
  sources,
  byCurrency,
  locale: localeProp,
}) => {
  const { locale, t, displayCurrency } = useTranslation();
  const lc = localeProp || locale;
  const [expanded, setExpanded] = React.useState(false);

  const sign = net < 0 ? '−' : '';
  const ratio = income > 0 ? (net / income) * 100 : 0;
  const ratioStr = `${ratio >= 0 ? '+' : '−'}${Math.abs(ratio).toFixed(2)}%`;

  return (
    <div className={styles.hero}>
      <button
        type="button"
        className={styles.amountButton}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
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

      {expanded && (
        <div className={styles.details}>
          <div className={styles.detailSection}>
            <p className={styles.detailTitle}>{t('balance', 'byCurrency')}</p>
            {byCurrency.length === 0 ? (
              <p className={styles.emptyRow}>—</p>
            ) : (
              <ul className={styles.list}>
                {byCurrency.map((item) => (
                  <li key={item.currency} className={styles.listRow}>
                    <span>{item.currency}</span>
                    <strong>{item.amount < 0 ? '−' : '+'}{Math.abs(item.amount).toLocaleString(lc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.detailSection}>
            <p className={styles.detailTitle}>{t('balance', 'moneySources')}</p>
            {sources.length === 0 ? (
              <p className={styles.emptyRow}>—</p>
            ) : (
              <ul className={styles.list}>
                {sources.map((source) => (
                  <li key={source.id} className={styles.listRow}>
                    <span>{source.label} ({source.count})</span>
                    <strong>+{formatCurrency(Math.abs(source.amount), lc, displayCurrency)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HeroBalance;
