import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import type { SpendingInsights } from '../../utils/spendingInsights';
import { resolveCategoryDisplay } from './categoryDisplay';
import styles from '../../pages/Stats.module.css';

interface StatsInsightsGridProps {
  insights: SpendingInsights;
  onCategoryClick?: (categoryId: string) => void;
}

const StatsInsightsGrid: React.FC<StatsInsightsGridProps> = ({ insights, onCategoryClick }) => {
  const { t, locale, displayCurrency } = useTranslation();
  const { trend, growingCategory, anomaly, recurring } = insights;

  const hasAny = Boolean(trend || growingCategory || anomaly || recurring);
  if (!hasAny) {
    return (
      <div className={styles.insightsEmpty}>
        <span className={styles.insightMeta}>{t('stats', 'noInsights')}</span>
      </div>
    );
  }

  const signedPercent = (value: number) =>
    `${value >= 0 ? '+' : '−'}${Math.abs(value).toLocaleString(locale, { maximumFractionDigits: 0 })}%`;

  const growth = growingCategory ? resolveCategoryDisplay(growingCategory.categoryId, t) : null;

  return (
    <div className={styles.insightsGrid}>
      {trend && (
        <div className={styles.insightCard}>
          <span className={styles.insightTitle}>{t('stats', 'insightTrend')}</span>
          <span className={`${styles.insightValue} ${trend.percent >= 0 ? styles.expense : styles.income}`}>
            {signedPercent(trend.percent)}
          </span>
          <span className={styles.insightMeta}>{t('stats', 'previousPeriod')}</span>
        </div>
      )}

      {growingCategory && growth && (
        <button
          type="button"
          className={`${styles.insightCard} ${onCategoryClick ? styles.insightCardClickable : ''}`}
          onClick={onCategoryClick ? () => onCategoryClick(growingCategory.categoryId) : undefined}
          disabled={!onCategoryClick}
        >
          <span className={styles.insightTitle}>{t('stats', 'insightGrowth')}</span>
          <span className={styles.insightValue}>{growth.name}</span>
          <span className={styles.insightMeta}>
            +{formatCurrency(growingCategory.delta, locale, displayCurrency)}
          </span>
        </button>
      )}

      {anomaly && (
        <div className={styles.insightCard}>
          <span className={styles.insightTitle}>{t('stats', 'insightAnomaly')}</span>
          <span className={styles.insightValue}>{formatCurrency(anomaly.amount, locale, displayCurrency)}</span>
          <span className={styles.insightMeta}>{formatDate(anomaly.date, locale)}</span>
        </div>
      )}

      {recurring && (
        <div className={styles.insightCard}>
          <span className={styles.insightTitle}>{t('stats', 'insightRecurring')}</span>
          <span className={styles.insightValue}>{recurring.label}</span>
          <span className={styles.insightMeta}>
            {recurring.count}× · {Math.round(recurring.cadenceDays)} {t('stats', 'daysShort')}
          </span>
        </div>
      )}
    </div>
  );
};

export default StatsInsightsGrid;
