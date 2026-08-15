import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatters';
import { SHORT_MASK } from '../../utils/moneyPrivacy';
import styles from '../../pages/Stats.module.css';

interface StatsSummaryStripProps {
  income: number;
  expense: number;
  net: number;
  previousNet: number;
}

const StatsSummaryStrip: React.FC<StatsSummaryStripProps> = ({ income, expense, net, previousNet }) => {
  const { t, locale, displayCurrency, moneyHidden } = useTranslation();

  const changePct =
    Math.abs(previousNet) > 0.01 ? ((net - previousNet) / Math.abs(previousNet)) * 100 : null;
  const changeStr =
    changePct === null
      ? null
      : moneyHidden
        ? `${SHORT_MASK}%`
        : `${changePct >= 0 ? '+' : '−'}${Math.abs(changePct).toLocaleString(locale, {
            maximumFractionDigits: 0,
          })}%`;

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
          {changeStr && (
            <span className={`${styles.summaryChange} ${changePct! >= 0 ? styles.positive : styles.negative}`}>
              {changeStr} {t('stats', 'vsPrevious')}
            </span>
          )}
        </div>
      </div>
    </>
  );
};

export default StatsSummaryStrip;
