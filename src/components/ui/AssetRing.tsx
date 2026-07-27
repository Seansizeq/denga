import React, { useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatters';
import { usePersistedHiddenIds } from '../../hooks/usePersistedHiddenIds';
import styles from './AssetRing.module.css';

interface AssetSegment {
  id: string;
  label: string;
  amount: number;
  color: string;
}

interface AssetRingProps {
  segments: AssetSegment[];
}

const AssetRing: React.FC<AssetRingProps> = ({ segments }) => {
  const { t, locale, displayCurrency } = useTranslation();
  const { hiddenIds, toggleHidden } = usePersistedHiddenIds('denga.accounts.hiddenSections.v1');
  const visibleSegments = segments.filter((segment) => !hiddenIds.has(segment.id));
  const visibleTotal = visibleSegments.reduce((sum, segment) => sum + segment.amount, 0);

  const donutBackground = useMemo(() => {
    if (!visibleTotal || visibleSegments.length === 0) {
      return 'conic-gradient(var(--bg-card-light) 0deg 360deg)';
    }
    if (visibleSegments.length === 1) {
      return `conic-gradient(${visibleSegments[0].color} 0deg 360deg)`;
    }
    let acc = 0;
    const parts = visibleSegments.map((seg) => {
      const start = (acc / visibleTotal) * 360;
      acc += seg.amount;
      const end = (acc / visibleTotal) * 360;
      return `${seg.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
    });
    return `conic-gradient(${parts.join(', ')})`;
  }, [visibleSegments, visibleTotal]);

  const formattedTotal = visibleTotal > 0 ? formatCurrency(visibleTotal, locale, displayCurrency) : '—';

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
        {segments.map((seg) => {
          const isHidden = hiddenIds.has(seg.id);
          return (
            <li
              key={seg.id}
              className={`${styles.legendItem} ${isHidden ? styles.legendItemHidden : ''}`}
            >
              <button
                type="button"
                className={styles.legendRow}
                onClick={() => toggleHidden(seg.id)}
                aria-label={`${t('stats', isHidden ? 'showCategory' : 'hideCategory')}: ${seg.label}`}
                title={t('stats', isHidden ? 'showCategory' : 'hideCategory')}
              >
                <span className={styles.legendLeft}>
                  <span className={styles.legendDot} style={{ backgroundColor: seg.color }} />
                  <span className={styles.legendName}>{seg.label}</span>
                </span>
                <span className={styles.legendRight}>
                  <span className={styles.legendPercent}>
                    {!isHidden && visibleTotal > 0 ? `${Math.round((seg.amount / visibleTotal) * 100)}%` : '—'}
                  </span>
                  <span className={styles.legendValue}>
                    {formatCurrency(seg.amount, locale, displayCurrency)}
                  </span>
                  {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default AssetRing;
