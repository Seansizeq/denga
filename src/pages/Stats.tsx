import React, { useMemo, useState } from 'react';
import { useTransactions } from '../context/TransactionContext';
import { useTranslation } from '../i18n/LanguageContext';
import { formatCurrency, isSameMonth } from '../utils/formatters';
import { findCategory, getCustomCategoryData } from '../constants/categories';
import type { CategoryKey } from '../i18n/translations';
import type { RangeFilter } from '../components/ui/RecentTransactions';
import styles from './Stats.module.css';

const Stats: React.FC = () => {
  const { t, locale } = useTranslation();
  const { transactions } = useTransactions();
  const [range, setRange] = useState<RangeFilter>('today');
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);

  const inRange = useMemo(() => {
    const now = new Date();
    return (iso: string) => {
      const d = new Date(iso);
      if (range === 'all') return true;
      if (range === 'today') return d.toDateString() === now.toDateString();
      if (range === 'week') {
        const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 7;
      }
      if (range === 'month') return isSameMonth(iso);
      return true;
    };
  }, [range]);

  const filtered = useMemo(
    () => transactions.filter((tx) => inRange(tx.date)),
    [transactions, inRange]
  );

  const income = filtered
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const expense = filtered
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const net = income - expense;

  const byCategory = useMemo(() => {
    const map = new Map<string, { id: string; total: number; count: number }>();
    for (const tx of filtered) {
      if (tx.type !== 'expense') continue;
      const existing = map.get(tx.categoryId) ?? { id: tx.categoryId, total: 0, count: 0 };
      existing.total += tx.amount;
      existing.count += 1;
      map.set(tx.categoryId, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const periodLabel = t('range', range);
  const rangeOptions: RangeFilter[] = ['today', 'week', 'month', 'all'];

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

  const donutBackground = useMemo(() => {
    if (!totalExpenseByCategories) {
      return 'conic-gradient(var(--bg-card-light) 0deg 360deg)';
    }
    let acc = 0;
    const gapDeg = 3;
    const segments = categoryRows
      .map((row) => {
        const rawStart = (acc / totalExpenseByCategories) * 360;
        acc += row.total;
        const rawEnd = (acc / totalExpenseByCategories) * 360;
        const start = rawStart + gapDeg / 2;
        const end = Math.max(start, rawEnd - gapDeg / 2);
        return `${row.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
      })
      .join(', ');
    return `conic-gradient(${segments})`;
  }, [categoryRows, totalExpenseByCategories]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('stats', 'title')}</h1>
        <span className={styles.subtitle}>{periodLabel}</span>
      </header>
      <div className={styles.rangeRow}>
        <button
          type="button"
          className={styles.rangeBtnSingle}
          onClick={() => setRangeMenuOpen((prev) => !prev)}
        >
          {periodLabel}
        </button>
        {rangeMenuOpen ? (
          <div className={styles.rangeMenu}>
            {rangeOptions
              .filter((opt) => opt !== range)
              .map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={styles.rangeMenuBtn}
                  onClick={() => {
                    setRange(opt);
                    setRangeMenuOpen(false);
                  }}
                >
                  {t('range', opt)}
                </button>
              ))}
          </div>
        ) : null}
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('stats', 'totalIncome')}</span>
          <span className={`${styles.summaryValue} ${styles.income}`}>
            {formatCurrency(income, locale)}
          </span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('stats', 'totalExpense')}</span>
          <span className={`${styles.summaryValue} ${styles.expense}`}>
            {formatCurrency(expense, locale)}
          </span>
        </div>
      </div>

      <div className={styles.netCard}>
        <span className={styles.summaryLabel}>{t('stats', 'net')}</span>
        <span
          className={`${styles.netValue} ${net < 0 ? styles.negative : styles.positive}`}
        >
          {net < 0 ? '−' : '+'}
          {formatCurrency(net, locale)}
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
              <div className={styles.donut} style={{ background: donutBackground }}>
                <div className={styles.donutInner}>
                  <span className={styles.donutValue}>{formatCurrency(totalExpenseByCategories, locale)}</span>
                </div>
              </div>
            </div>

            <ul className={styles.legendList}>
              {categoryRows.map((row) => (
                <li key={row.id} className={styles.legendItem}>
                  <span className={styles.legendLeft}>
                    <span className={styles.legendDot} style={{ backgroundColor: row.color }} />
                    <span className={styles.legendName}>{row.name}</span>
                  </span>
                  <span className={styles.legendValue}>{formatCurrency(row.total, locale)}</span>
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
