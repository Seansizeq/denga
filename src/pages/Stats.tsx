import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import { useTranslation } from '../i18n/LanguageContext';
import { formatCurrency, isSameMonth } from '../utils/formatters';
import { findCategory, getCustomCategoryData } from '../constants/categories';
import type { CategoryKey } from '../i18n/translations';
import styles from './Stats.module.css';

type StatsRange = 'week' | 'month' | 'year';

const Stats: React.FC = () => {
  const { t, locale, displayCurrency, convertAmount } = useTranslation();
  const { transactions } = useTransactions();
  const [range, setRange] = useState<StatsRange>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<string[]>([]);

  const inRange = useMemo(() => {
    const now = new Date();
    return (iso: string) => {
      const d = new Date(iso);
      if (range === 'week') {
        const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 7;
      }
      if (range === 'month') return isSameMonth(iso, selectedMonth);
      if (range === 'year') return d.getFullYear() === now.getFullYear();
      return true;
    };
  }, [range, selectedMonth]);

  const filtered = useMemo(
    () => transactions.filter((tx) => inRange(tx.date)),
    [transactions, inRange]
  );

  const income = filtered
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + convertAmount(tx.amount, tx.currency), 0);

  const expense = filtered
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + convertAmount(tx.amount, tx.currency), 0);

  const net = income - expense;

  const byCategory = useMemo(() => {
    const map = new Map<string, { id: string; total: number; count: number }>();
    for (const tx of filtered) {
      if (tx.type !== 'expense') continue;
      const existing = map.get(tx.categoryId) ?? { id: tx.categoryId, total: 0, count: 0 };
      existing.total += convertAmount(tx.amount, tx.currency);
      existing.count += 1;
      map.set(tx.categoryId, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered, convertAmount]);

  const rangeOptions: StatsRange[] = ['week', 'month', 'year'];
  const monthLabel = useMemo(
    () => selectedMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
    [selectedMonth, locale]
  );

  const shiftSelectedMonth = (delta: number) => {
    setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const categoryRows = useMemo(
    () =>
      byCategory.map((row) => {
        const customCategory = getCustomCategoryData(row.id);
        const category = customCategory ? findCategory('other_expense') : findCategory(row.id);
        return {
          ...row,
          color: customCategory?.color ?? category.color,
          name: customCategory?.name ?? t('categories', category.id as CategoryKey),
        };
      }),
    [byCategory, t]
  );

  const totalExpenseByCategories = categoryRows.reduce((sum, row) => sum + row.total, 0);
  const visibleCategoryRows = useMemo(
    () => categoryRows.filter((row) => !hiddenCategoryIds.includes(row.id)),
    [categoryRows, hiddenCategoryIds]
  );
  const visibleExpenseTotal = visibleCategoryRows.reduce((sum, row) => sum + row.total, 0);

  const donutBackground = useMemo(() => {
    if (!visibleExpenseTotal) {
      return 'conic-gradient(var(--bg-card-light) 0deg 360deg)';
    }
    if (visibleCategoryRows.length === 1) {
      return `conic-gradient(${visibleCategoryRows[0].color} 0deg 360deg)`;
    }
    let acc = 0;
    const segments = visibleCategoryRows
      .map((row) => {
        const rawStart = (acc / visibleExpenseTotal) * 360;
        acc += row.total;
        const rawEnd = (acc / visibleExpenseTotal) * 360;
        return `${row.color} ${rawStart.toFixed(2)}deg ${rawEnd.toFixed(2)}deg`;
      })
      .join(', ');
    return `conic-gradient(${segments})`;
  }, [visibleCategoryRows, visibleExpenseTotal]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('stats', 'title')}</h1>
      </header>
      <div className={styles.rangeRow}>
        <div className={styles.rangeTabs} role="tablist" aria-label="Stats range">
          {rangeOptions.map((opt) => (
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
      </div>
      {range === 'month' && (
        <div className={styles.monthNav}>
          <button
            type="button"
            className={styles.monthNavBtn}
            onClick={() => shiftSelectedMonth(-1)}
            aria-label={t('planner', 'prevMonth')}
          >
            <ChevronLeft size={16} />
          </button>
          <span className={styles.monthNavLabel}>{monthLabel}</span>
          <button
            type="button"
            className={styles.monthNavBtn}
            onClick={() => shiftSelectedMonth(1)}
            aria-label={t('planner', 'nextMonth')}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

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
        <span
          className={`${styles.netValue} ${net < 0 ? styles.negative : styles.positive}`}
        >
          {net < 0 ? '−' : '+'}
          {formatCurrency(net, locale, displayCurrency)}
        </span>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('stats', 'byCategory')}</h2>

        {byCategory.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📊</span>
            <p className={styles.emptyText}>{t('stats', 'noData')}</p>
          </div>
        ) : (
          <div className={styles.chartCard}>
            <div className={styles.donutWrap}>
              <div className={styles.donutGlow} style={{ background: donutBackground }} aria-hidden="true" />
              <div className={styles.donut} style={{ background: donutBackground }}>
                <div className={styles.donutInner}>
                  <span className={styles.donutLabel}>{t('stats', 'totalExpense')}</span>
                  <span className={styles.donutValue}>{formatCurrency(visibleExpenseTotal, locale, displayCurrency)}</span>
                  <span className={styles.donutSubLabel}>
                    {visibleCategoryRows.length} {t('stats', 'byCategory').toLowerCase()}
                  </span>
                </div>
              </div>
            </div>

            <ul className={styles.legendList}>
              {categoryRows.map((row) => (
                <li
                  key={row.id}
                  className={`${styles.legendItem} ${hiddenCategoryIds.includes(row.id) ? styles.legendItemHidden : ''}`}
                >
                  <span className={styles.legendLeft}>
                    <span className={styles.legendDot} style={{ backgroundColor: row.color }} />
                    <span className={styles.legendName}>{row.name}</span>
                  </span>
                  <span className={styles.legendRight}>
                    <span className={styles.legendPercent}>
                      {totalExpenseByCategories
                        ? `${Math.round((row.total / totalExpenseByCategories) * 100)}%`
                        : '0%'}
                    </span>
                    <span className={styles.legendValue}>{formatCurrency(row.total, locale, displayCurrency)}</span>
                    <button
                      type="button"
                      className={styles.legendToggleBtn}
                      onClick={() =>
                        setHiddenCategoryIds((prev) =>
                          prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id]
                        )
                      }
                      aria-label={
                        hiddenCategoryIds.includes(row.id)
                          ? t('stats', 'showCategory')
                          : t('stats', 'hideCategory')
                      }
                      title={
                        hiddenCategoryIds.includes(row.id)
                          ? t('stats', 'showCategory')
                          : t('stats', 'hideCategory')
                      }
                    >
                      {hiddenCategoryIds.includes(row.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
};

export default Stats;
