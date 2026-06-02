import React from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import styles from '../../pages/Stats.module.css';

interface StatsPeriodNavProps {
  label: string;
  isCurrent: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
}

const StatsPeriodNav: React.FC<StatsPeriodNavProps> = ({ label, isCurrent, onPrev, onNext, onReset }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.periodNav}>
      <button
        type="button"
        className={styles.periodNavBtn}
        onClick={onPrev}
        aria-label={t('stats', 'prevPeriod')}
      >
        <ChevronLeft size={16} />
      </button>
      <span className={styles.periodNavLabel}>{label}</span>
      <button
        type="button"
        className={styles.periodNavBtn}
        onClick={onNext}
        aria-label={t('stats', 'nextPeriod')}
      >
        <ChevronRight size={16} />
      </button>
      {!isCurrent && (
        <button
          type="button"
          className={styles.periodResetBtn}
          onClick={onReset}
          aria-label={t('stats', 'goToToday')}
          title={t('stats', 'goToToday')}
        >
          <RotateCcw size={14} />
        </button>
      )}
    </div>
  );
};

export default StatsPeriodNav;
