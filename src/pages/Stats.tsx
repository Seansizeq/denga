import React, { useCallback, useEffect, useState } from 'react';
import { PieChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTransactions } from '../context/TransactionContext';
import { useTranslation } from '../i18n/LanguageContext';
import { useDenominationRates } from '../hooks/useDenominationRates';
import { getBudgets, type CategoryBudget } from '../api/client';
import { useStatsPeriod } from '../hooks/useStatsPeriod';
import { useStatsAggregates } from '../hooks/useStatsAggregates';
import { toIsoDateParam, type StatsRange } from '../utils/statsPeriod';
import StatsPeriodNav from '../components/stats/StatsPeriodNav';
import StatsSummaryStrip from '../components/stats/StatsSummaryStrip';
import StatsCategoryChart from '../components/stats/StatsCategoryChart';
import ResultCardSheet from '../components/stats/ResultCardSheet';
import styles from './Stats.module.css';

const RANGE_OPTIONS: StatsRange[] = ['today', 'week', 'month', 'year'];

const Stats: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { convert } = useDenominationRates();
  const { transactions } = useTransactions();

  const { range, setRange, bounds, previousBounds, periodLabel, isCurrent, goPrev, goNext, goToCurrent } =
    useStatsPeriod();
  const [chartType, setChartType] = useState<'expense' | 'income'>('expense');
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [resultCardOpen, setResultCardOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBudgets()
      .then((rows) => {
        if (!cancelled) setBudgets(rows);
      })
      .catch(() => {
        /* budgets are optional decoration */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const aggregates = useStatsAggregates({
    transactions,
    convertAmount: convert,
    bounds,
    previousBounds,
    chartType,
  });

  const openHistory = useCallback(
    (opts: { categoryId?: string; from?: Date; to?: Date; type?: 'expense' | 'income' }) => {
      const sp = new URLSearchParams();
      sp.set('type', opts.type ?? chartType);
      if (opts.categoryId) sp.set('categoryId', opts.categoryId);
      sp.set('from', toIsoDateParam(opts.from ?? bounds.start));
      sp.set('to', toIsoDateParam(opts.to ?? bounds.end));
      navigate(`/history?${sp.toString()}`);
    },
    [chartType, bounds, navigate],
  );

  const showBudgets = chartType === 'expense' && range === 'month';
  const hasCategoryData = aggregates.byCategory.length > 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('stats', 'title')}</h1>
      </header>

      <div className={styles.rangeTabs} role="tablist" aria-label={t('stats', 'title')}>
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={range === opt}
            className={`${styles.rangeTabBtn} ${range === opt ? styles.rangeTabBtnActive : ''}`}
            onClick={() => setRange(opt)}
          >
            {t('range', opt)}
          </button>
        ))}
      </div>

      <StatsPeriodNav
        label={periodLabel}
        isCurrent={isCurrent}
        onPrev={goPrev}
        onNext={goNext}
        onReset={goToCurrent}
      />

      <StatsSummaryStrip
        income={aggregates.income}
        expense={aggregates.expense}
        net={aggregates.net}
        onSaveImage={() => setResultCardOpen(true)}
      />

      <section className={styles.section}>
        <div className={styles.sectionHeaderWithToggle}>
          <h2 className={styles.sectionTitle}>{t('stats', 'byCategory')}</h2>
          <div className={styles.chartTypeTabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={chartType === 'expense'}
              className={`${styles.chartTypeBtn} ${chartType === 'expense' ? styles.chartTypeBtnActive : ''}`}
              onClick={() => setChartType('expense')}
            >
              {t('balance', 'expense')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartType === 'income'}
              className={`${styles.chartTypeBtn} ${chartType === 'income' ? styles.chartTypeBtnActive : ''}`}
              onClick={() => setChartType('income')}
            >
              {t('balance', 'income')}
            </button>
          </div>
        </div>

        {hasCategoryData ? (
          <StatsCategoryChart
            byCategory={aggregates.byCategory}
            transactionCount={aggregates.transactionCount}
            budgets={budgets}
            showBudgets={showBudgets}
            onCategoryClick={(categoryId) => openHistory({ categoryId })}
            onManageBudgets={() => navigate('/budgets')}
          />
        ) : (
          <div className={styles.emptyState}>
            <PieChart size={36} className={styles.emptyIcon} aria-hidden="true" />
            <p className={styles.emptyText}>{t('stats', 'noData')}</p>
          </div>
        )}
      </section>

      <ResultCardSheet
        open={resultCardOpen}
        onClose={() => setResultCardOpen(false)}
        range={range}
        periodLabel={periodLabel}
        currentNet={aggregates.net}
        previousNet={aggregates.previousNet}
      />
    </div>
  );
};

export default Stats;
