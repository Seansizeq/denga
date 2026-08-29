import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTransactions } from '../context/TransactionContext';
import TransactionItem from '../components/ui/TransactionItem';
import RowSkeleton from '../components/ui/RowSkeleton';
import HistoryCalendar from '../components/ui/HistoryCalendar';
import { useTranslation } from '../i18n/LanguageContext';
import { showAppAlert } from '../utils/notify';
import { localIsoDate } from '../utils/dateRanges';
import styles from './History.module.css';

const History: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { transactions, deleteTransaction, isBootstrapping } = useTransactions();
  const { t, locale } = useTranslation();

  const categoryId = searchParams.get('categoryId');
  const typeParam = searchParams.get('type');
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const hasFilter = Boolean(categoryId || typeParam || fromParam || toParam);

  /** Дні, у яких є операції — календар підсвічує саме їх. */
  const activeDays = useMemo(() => {
    const set = new Set<string>();
    for (const tx of transactions) set.add(localIsoDate(new Date(tx.date)));
    return set;
  }, [transactions]);

  /**
   * Календар працює тим самим фільтром `from`/`to`, що й перехід зі статистики,
   * тож обраний день — це діапазон рівно в одну добу (`to` виключне).
   */
  const selectedDay = useMemo(() => {
    if (!fromParam || !toParam) return null;
    const next = new Date(`${fromParam}T00:00:00`);
    next.setDate(next.getDate() + 1);
    return localIsoDate(next) === toParam ? fromParam : null;
  }, [fromParam, toParam]);

  const handleSelectDay = (day: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (!day) {
      next.delete('from');
      next.delete('to');
    } else {
      const end = new Date(`${day}T00:00:00`);
      end.setDate(end.getDate() + 1);
      next.set('from', day);
      next.set('to', localIsoDate(end));
    }
    setSearchParams(next);
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteTransaction(id);
    if (!ok) showAppAlert(t('addTx', 'saveFailed'));
  };

  const visible = useMemo(() => {
    if (!hasFilter) return transactions;
    const fromTime = fromParam ? new Date(`${fromParam}T00:00:00`).getTime() : null;
    const toTime = toParam ? new Date(`${toParam}T00:00:00`).getTime() : null;
    return transactions.filter((tx) => {
      if (categoryId && tx.categoryId !== categoryId) return false;
      if (typeParam && tx.type !== typeParam) return false;
      const time = new Date(tx.date).getTime();
      if (fromTime !== null && time < fromTime) return false;
      if (toTime !== null && time >= toTime) return false;
      return true;
    });
  }, [transactions, hasFilter, categoryId, typeParam, fromParam, toParam]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: typeof transactions }>();
    for (const tx of visible) {
      const d = new Date(tx.date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const label = d.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
      });
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(tx);
    }
    return Array.from(map.values());
  }, [visible, locale]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{hasFilter ? t('history', 'filteredTitle') : t('history', 'title')}</h1>
        {hasFilter && (
          <button type="button" className={styles.back} onClick={() => setSearchParams({})}>
            {t('history', 'clearFilter')}
          </button>
        )}
      </header>

      <HistoryCalendar activeDays={activeDays} selectedDay={selectedDay} onSelectDay={handleSelectDay} />

      {visible.length === 0 ? (
        isBootstrapping ? (
          <RowSkeleton count={5} />
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📭</span>
            <p className={styles.emptyText}>{t('history', 'empty')}</p>
          </div>
        )
      ) : (
        <div className={styles.groups}>
          {grouped.map((group) => (
            <section key={group.label} className={styles.group}>
              <h3 className={styles.groupLabel}>{group.label}</h3>
              <div className={styles.list}>
                {group.items.map((tx, i) => (
                  <TransactionItem
                    key={tx.id}
                    index={i}
                    transaction={tx}
                    onDelete={handleDelete}
                    onEdit={(id) => navigate(`/add?edit=${id}`)}
                    showDate={false}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default History;
