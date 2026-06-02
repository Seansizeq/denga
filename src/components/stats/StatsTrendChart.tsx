import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatters';
import type { TrendBucket } from '../../utils/statsTrendBuckets';
import styles from '../../pages/Stats.module.css';

interface StatsTrendChartProps {
  buckets: TrendBucket[];
  onBucketClick?: (bucket: TrendBucket) => void;
}

const StatsTrendChart: React.FC<StatsTrendChartProps> = ({ buckets, onBucketClick }) => {
  const { t, locale, displayCurrency } = useTranslation();
  const max = buckets.reduce((acc, b) => Math.max(acc, b.amount), 0);

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('stats', 'trendTitle')}</h2>
      <div className={styles.trendCard}>
        <div className={styles.trendBars}>
          {buckets.map((bucket) => {
            const heightPct = max > 0 ? Math.max((bucket.amount / max) * 100, bucket.amount > 0 ? 4 : 0) : 0;
            return (
              <button
                key={bucket.key}
                type="button"
                className={styles.trendBarColumn}
                onClick={onBucketClick ? () => onBucketClick(bucket) : undefined}
                disabled={!onBucketClick || bucket.amount === 0}
                aria-label={`${bucket.label}: ${formatCurrency(bucket.amount, locale, displayCurrency)}`}
                title={formatCurrency(bucket.amount, locale, displayCurrency)}
              >
                <span className={styles.trendBarTrack}>
                  <span className={styles.trendBarFill} style={{ height: `${heightPct}%` }} />
                </span>
                <span className={styles.trendBarLabel}>{bucket.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default StatsTrendChart;
