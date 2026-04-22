import React, { useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
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
  const [range, setRange] = useState<RangeFilter>('month');

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
  const rangeOrder: RangeFilter[] = ['today', 'week', 'month', 'all'];
  const cycleRange = () => {
    const idx = rangeOrder.indexOf(range);
    const next = rangeOrder[(idx + 1) % rangeOrder.length];
    setRange(next);
  };

  const maxExpense = byCategory[0]?.total ?? 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('stats', 'title')}</h1>
        <span className={styles.subtitle}>{periodLabel}</span>
      </header>
      <div className={styles.rangeRow}>
        <button type="button" className={styles.rangeBtnSingle} onClick={cycleRange}>
          {periodLabel}
        </button>
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
          <ul className={styles.catList}>
            {byCategory.map((row) => {
              const customCategory = getCustomCategoryData(row.id);
              const category = customCategory
                ? findCategory('other_expense')
                : findCategory(row.id);
              const IconComponent =
                customCategory
                  ? ((LucideIcons as any)[customCategory.icon] ?? LucideIcons.Tag)
                  : ((LucideIcons as any)[category.icon] ?? LucideIcons.Circle);
              const percentage = maxExpense
                ? Math.round((row.total / maxExpense) * 100)
                : 0;
              return (
                <li key={row.id} className={styles.catRow}>
                  <div className={styles.catIcon}>
                    <IconComponent
                      size={22}
                      color={customCategory?.color ?? category.color}
                      strokeWidth={2}
                    />
                  </div>
                  <div className={styles.catBody}>
                    <div className={styles.catTopLine}>
                      <span className={styles.catName}>
                        {customCategory?.name ?? t('categories', category.id as CategoryKey)}
                      </span>
                      <span className={styles.catTotal}>
                        {formatCurrency(row.total, locale)}
                      </span>
                    </div>
                    <div className={styles.catBarTrack}>
                      <div
                        className={styles.catBarFill}
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: customCategory?.color ?? category.color,
                        }}
                      />
                    </div>
                    <span className={styles.catMeta}>
                      {row.count} {t('stats', 'transactions')}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default Stats;
