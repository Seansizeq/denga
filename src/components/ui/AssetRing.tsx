import React, { useMemo } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatters';
import styles from './AssetRing.module.css';

interface AssetSegment {
  id: string;
  label: string;
  amount: number;
  color: string;
}

interface AssetRingProps {
  segments: AssetSegment[];
  total: number;
}

const AssetRing: React.FC<AssetRingProps> = ({ segments, total }) => {
  const { locale, displayCurrency } = useTranslation();

  const donutBackground = useMemo(() => {
    if (!total || segments.length === 0) {
      return 'conic-gradient(var(--bg-card-light) 0deg 360deg)';
    }
    if (segments.length === 1) {
      return `conic-gradient(${segments[0].color} 0deg 360deg)`;
    }
    let acc = 0;
    const parts = segments.map((seg) => {
      const start = (acc / total) * 360;
      acc += seg.amount;
      const end = (acc / total) * 360;
      return `${seg.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
    });
    return `conic-gradient(${parts.join(', ')})`;
  }, [segments, total]);

  const formattedTotal = total > 0 ? formatCurrency(total, locale, displayCurrency) : '—';

  return (
    <div className={styles.card}>
      <div className={styles.donutWrap}>
        <div className={styles.donut} style={{ background: donutBackground }}>
          <div className={styles.donutInner}>
            <span className={styles.donutValue}>{formattedTotal}</span>
            <span className={styles.donutLabel}>Всього активів</span>
          </div>
        </div>
      </div>

      <ul className={styles.legendList}>
        {segments.map((seg) => (
          <li key={seg.id} className={styles.legendItem}>
            <div className={styles.legendRow}>
              <span className={styles.legendLeft}>
                <span className={styles.legendDot} style={{ backgroundColor: seg.color }} />
                <span className={styles.legendName}>{seg.label}</span>
              </span>
              <span className={styles.legendRight}>
                <span className={styles.legendPercent}>
                  {total > 0 ? `${Math.round((seg.amount / total) * 100)}%` : '0%'}
                </span>
                <span className={styles.legendValue}>
                  {formatCurrency(seg.amount, locale, displayCurrency)}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AssetRing;
