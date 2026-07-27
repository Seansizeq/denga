import React, { useMemo } from 'react';
import { ChevronRight, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatters';
import type { CategoryBudget } from '../../api/client';
import type { CategoryTotal } from '../../hooks/useStatsAggregates';
import { usePersistedHiddenIds } from '../../hooks/usePersistedHiddenIds';
import { resolveCategoryDisplay } from './categoryDisplay';
import styles from '../../pages/Stats.module.css';

interface StatsCategoryChartProps {
  byCategory: CategoryTotal[];
  transactionCount: number;
  budgets: CategoryBudget[];
  showBudgets: boolean;
  onCategoryClick?: (categoryId: string) => void;
  onManageBudgets?: () => void;
}

const StatsCategoryChart: React.FC<StatsCategoryChartProps> = ({
  byCategory,
  transactionCount,
  budgets,
  showBudgets,
  onCategoryClick,
  onManageBudgets,
}) => {
  const { t, locale, displayCurrency, convertAmount } = useTranslation();
  const { hiddenIds, toggleHidden } = usePersistedHiddenIds('denga.stats.hiddenCategories.v1');

  const rows = useMemo(
    () =>
      byCategory.map((row) => {
        const display = resolveCategoryDisplay(row.id, t);
        return { ...row, color: display.color, name: display.name };
      }),
    [byCategory, t],
  );

  const visibleRows = rows.filter((row) => !hiddenIds.has(row.id));
  const total = visibleRows.reduce((sum, row) => sum + row.total, 0);
  const visibleTransactionCount =
    hiddenIds.size === 0 ? transactionCount : visibleRows.reduce((sum, row) => sum + row.count, 0);
  const topRow = visibleRows[0];
  const topPercent = total > 0 && topRow ? Math.round((topRow.total / total) * 100) : 0;

  const donutBackground = useMemo(() => {
    if (!total) return 'conic-gradient(var(--bg-card-light) 0deg 360deg)';
    if (visibleRows.length === 1) return `conic-gradient(${visibleRows[0].color} 0deg 360deg)`;
    let acc = 0;
    const segments = visibleRows
      .map((row) => {
        const start = (acc / total) * 360;
        acc += row.total;
        const end = (acc / total) * 360;
        return `${row.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
      })
      .join(', ');
    return `conic-gradient(${segments})`;
  }, [visibleRows, total]);

  return (
    <div className={styles.chartCard}>
      <div className={styles.donutWrap}>
        <div className={styles.donut} style={{ background: donutBackground }}>
          <div className={styles.donutInner}>
            {topRow ? (
              <>
                <span className={styles.donutValue}>{topPercent}%</span>
                <span className={styles.donutLabel}>{topRow.name}</span>
              </>
            ) : (
              <span className={styles.donutValue}>0%</span>
            )}
            <span className={styles.donutSubLabel}>
              {visibleRows.length} {t('stats', 'categoriesWord')} · {visibleTransactionCount}{' '}
              {t('stats', 'transactions')}
            </span>
          </div>
        </div>
      </div>

      <ul className={styles.legendList}>
        {rows.map((row) => {
          const isHidden = hiddenIds.has(row.id);
          const budget = showBudgets ? budgets.find((b) => b.categoryId === row.id) : undefined;
          const limit = budget ? convertAmount(budget.monthlyLimit, budget.currency) : 0;
          const ratio = limit > 0 ? row.total / limit : 0;
          const overBudget = ratio > 1;
          const nearBudget = ratio > 0.9 && ratio <= 1;

          return (
            <li
              key={row.id}
              className={`${styles.legendItem} ${isHidden ? styles.legendItemHidden : ''}`}
            >
              <div className={styles.legendTopRow}>
                <button
                  type="button"
                  className={styles.legendRow}
                  onClick={onCategoryClick ? () => onCategoryClick(row.id) : undefined}
                  disabled={!onCategoryClick}
                >
                  <span className={styles.legendLeft}>
                    <span className={styles.legendDot} style={{ backgroundColor: row.color }} />
                    <span className={styles.legendName}>{row.name}</span>
                  </span>
                  <span className={styles.legendRight}>
                    <span className={styles.legendPercent}>
                      {!isHidden && total ? `${Math.round((row.total / total) * 100)}%` : '—'}
                    </span>
                    <span className={styles.legendValue}>{formatCurrency(row.total, locale, displayCurrency)}</span>
                    {onCategoryClick && <ChevronRight size={14} className={styles.legendChevron} />}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.legendVisibilityBtn}
                  onClick={() => toggleHidden(row.id)}
                  aria-label={`${t('stats', isHidden ? 'showCategory' : 'hideCategory')}: ${row.name}`}
                  title={t('stats', isHidden ? 'showCategory' : 'hideCategory')}
                >
                  {isHidden ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {budget && limit > 0 && (
                <div className={styles.budgetRow}>
                  <span className={styles.budgetTrack}>
                    <span
                      className={`${styles.budgetFill} ${
                        overBudget ? styles.budgetOver : nearBudget ? styles.budgetNear : ''
                      }`}
                      style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                    />
                  </span>
                  <span className={`${styles.budgetText} ${overBudget ? styles.budgetOverText : ''}`}>
                    {formatCurrency(row.total, locale, displayCurrency)} / {formatCurrency(limit, locale, displayCurrency)}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {showBudgets && onManageBudgets && (
        <button type="button" className={styles.manageBudgetsBtn} onClick={onManageBudgets}>
          {t('stats', 'manageBudgets')}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
};

export default StatsCategoryChart;
