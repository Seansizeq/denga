import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { Transaction } from '../../types';
import { useTranslation } from '../../i18n/LanguageContext';
import TransactionItem from './TransactionItem';
import styles from './RecentTransactions.module.css';

export type RangeFilter = 'today' | 'week' | 'month' | 'all';

interface Props {
  transactions: Transaction[];
  limit?: number;
  onDelete?: (id: string) => void;
  showFilter?: boolean;
  filter?: RangeFilter;
  onFilterChange?: (f: RangeFilter) => void;
  title?: string;
  showSeeAll?: boolean;
}

const RecentTransactions: React.FC<Props> = ({
  transactions,
  limit = 8,
  onDelete,
  showFilter = true,
  filter = 'today',
  onFilterChange,
  title,
  showSeeAll = true,
}) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const visible = transactions.slice(0, limit);

  const ranges: RangeFilter[] = ['today', 'week', 'month', 'all'];

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          {title ?? t('dashboard', 'recentTitle')}
        </h3>

        <div className={styles.headerRight}>
          {showSeeAll && transactions.length > 0 && (
            <Link to="/history" className={styles.seeAll}>
              {t('dashboard', 'seeAll')}
            </Link>
          )}
          {showFilter && (
            <div ref={menuRef} className={styles.filterWrap}>
              <button
                type="button"
                className={styles.filterPill}
                onClick={() => setMenuOpen((v) => !v)}
              >
                {t('range', filter)}
                <ChevronDown size={14} className={styles.filterChevron} />
              </button>
              {menuOpen && (
                <div className={styles.menu}>
                  {ranges.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`${styles.menuItem} ${r === filter ? styles.menuItemActive : ''}`}
                      onClick={() => {
                        onFilterChange?.(r);
                        setMenuOpen(false);
                      }}
                    >
                      {t('range', r)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className={styles.emptyState}>
          <span role="img" aria-label="empty" className={styles.emptyIcon}>📒</span>
          <p className={styles.emptyText}>{t('dashboard', 'empty')}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {visible.map((tx) => (
            <TransactionItem
              key={tx.id}
              transaction={tx}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default RecentTransactions;
