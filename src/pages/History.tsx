import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTransactions } from '../context/TransactionContext';
import TransactionItem from '../components/ui/TransactionItem';
import { useTranslation } from '../i18n/LanguageContext';
import styles from './History.module.css';

const History: React.FC = () => {
  const navigate = useNavigate();
  const { transactions, deleteTransaction } = useTransactions();
  const { t, locale } = useTranslation();

  const handleDelete = async (id: string) => {
    const ok = await deleteTransaction(id);
    if (!ok) window.alert(t('addTx', 'saveFailed'));
  };

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: typeof transactions }>();
    for (const tx of transactions) {
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
  }, [transactions, locale]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('history', 'title')}</h1>
      </header>

      {transactions.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📭</span>
          <p className={styles.emptyText}>{t('history', 'empty')}</p>
        </div>
      ) : (
        <div className={styles.groups}>
          {grouped.map((group) => (
            <section key={group.label} className={styles.group}>
              <h3 className={styles.groupLabel}>{group.label}</h3>
              <div className={styles.list}>
                {group.items.map((tx) => (
                  <TransactionItem
                    key={tx.id}
                    transaction={tx}
                    onDelete={handleDelete}
                    onEdit={(id) => navigate(`/add?edit=${id}`)}
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
