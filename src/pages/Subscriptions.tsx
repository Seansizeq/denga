import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { useTranslation } from '../i18n/LanguageContext';
import styles from './Subscriptions.module.css';

type BillingCycle = 'monthly' | 'yearly';

interface Subscription {
  id: string;
  name: string;
  amount: number;
  cycle: BillingCycle;
  nextChargeDate: string;
  note?: string;
  active: boolean;
}

const API_URL = import.meta.env.VITE_API_URL ?? '';

const Subscriptions: React.FC = () => {
  const { t, locale, displayCurrency } = useTranslation();
  const [items, setItems] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [nextChargeDate, setNextChargeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/subscriptions`);
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data)) setItems(data);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activeItems = items.filter((s) => s.active);

  const monthlyTotal = useMemo(
    () => activeItems.reduce((sum, s) => sum + (s.cycle === 'monthly' ? s.amount : s.amount / 12), 0),
    [activeItems]
  );

  const yearlyTotal = useMemo(
    () => activeItems.reduce((sum, s) => sum + (s.cycle === 'yearly' ? s.amount : s.amount * 12), 0),
    [activeItems]
  );

  const resetForm = () => {
    setName('');
    setAmount('');
    setCycle('monthly');
    setNextChargeDate(new Date().toISOString().slice(0, 10));
    setNote('');
    setEditingId(null);
    setIsFormOpen(false);
  };

  const onSave = async () => {
    const numericAmount = Number(amount.replace(',', '.'));
    if (!name.trim() || !numericAmount || numericAmount <= 0 || !nextChargeDate) return;
    try {
      const response = await fetch(
        editingId ? `${API_URL}/api/subscriptions/${editingId}` : `${API_URL}/api/subscriptions`,
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            amount: numericAmount,
            cycle,
            nextChargeDate,
            note: note.trim(),
          }),
        }
      );
      if (!response.ok) return;
      const saved = await response.json();
      if (editingId) {
        setItems((prev) => prev.map((s) => (s.id === editingId ? { ...s, ...saved } : s)));
      } else {
        setItems((prev) => [saved, ...prev]);
      }
      resetForm();
    } catch (error) {
      console.error('Error saving subscription:', error);
    }
  };

  const onDisable = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      });
      if (!response.ok) return;
      setItems((prev) => prev.map((s) => (s.id === id ? { ...s, active: false } : s)));
    } catch (error) {
      console.error('Error disabling subscription:', error);
    }
  };

  const onEdit = (sub: Subscription) => {
    setEditingId(sub.id);
    setIsFormOpen(true);
    setName(sub.name);
    setAmount(String(sub.amount));
    setCycle(sub.cycle);
    setNextChargeDate(sub.nextChargeDate);
    setNote(sub.note ?? '');
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('subscriptions', 'title')}</h1>
        <span className={styles.subtitle}>{t('subscriptions', 'subtitle')}</span>
      </header>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('subscriptions', 'monthlyTotal')}</span>
          <span className={styles.summaryValue}>{formatCurrency(monthlyTotal, locale, displayCurrency)}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('subscriptions', 'yearlyTotal')}</span>
          <span className={styles.summaryValue}>{formatCurrency(yearlyTotal, locale, displayCurrency)}</span>
        </div>
      </div>

      <div className={styles.countRow}>
        {t('subscriptions', 'activeCount')}: <strong>{activeItems.length}</strong>
      </div>

      <section className={styles.listSection}>
        {loading ? (
          <p className={styles.emptyText}>Loading...</p>
        ) : activeItems.length === 0 ? (
          <p className={styles.emptyText}>{t('subscriptions', 'empty')}</p>
        ) : (
          <div className={styles.list}>
            {activeItems.map((sub) => {
              const yearlyForItem = sub.cycle === 'yearly' ? sub.amount : sub.amount * 12;
              return (
                <article key={sub.id} className={styles.item}>
                <div className={styles.itemTop}>
                  <span className={styles.itemName}>{sub.name}</span>
                  <span className={styles.itemAmount}>{formatCurrency(sub.amount, locale, displayCurrency)}</span>
                </div>
                <div className={styles.itemMeta}>
                  <span>{sub.cycle === 'monthly' ? t('subscriptions', 'monthly') : t('subscriptions', 'yearly')}</span>
                  <span>{new Date(sub.nextChargeDate).toLocaleDateString(locale)}</span>
                </div>
                <div className={styles.itemYearlyRow}>
                  <span>{t('subscriptions', 'yearlyForItem')}</span>
                  <strong>{formatCurrency(yearlyForItem, locale, displayCurrency)}</strong>
                </div>
                {sub.note ? <p className={styles.itemNote}>{sub.note}</p> : null}
                <div className={styles.itemActions}>
                  <button type="button" className={styles.editBtn} onClick={() => onEdit(sub)}>
                    {t('subscriptions', 'edit')}
                  </button>
                  <button type="button" className={styles.disableBtn} onClick={() => onDisable(sub.id)}>
                    {t('subscriptions', 'disable')}
                  </button>
                </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {isFormOpen ? (
        <div className={styles.modalOverlay} onClick={resetForm}>
          <section className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.formTitle}>{t('subscriptions', 'addTitle')}</h2>
            <div className={styles.formGrid}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('subscriptions', 'name')}
              />
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder={t('subscriptions', 'amount')}
              />
              <select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}>
                <option value="monthly">{t('subscriptions', 'monthly')}</option>
                <option value="yearly">{t('subscriptions', 'yearly')}</option>
              </select>
              <input
                type="date"
                value={nextChargeDate}
                onChange={(e) => setNextChargeDate(e.target.value)}
                aria-label={t('subscriptions', 'nextChargeDate')}
              />
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('subscriptions', 'note')}
              />
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={resetForm}>
                {editingId ? t('subscriptions', 'cancelEdit') : t('addTx', 'cancel')}
              </button>
              <button type="button" className={styles.addBtn} onClick={onSave}>
                {editingId ? t('subscriptions', 'saveChanges') : t('subscriptions', 'add')}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <button
        type="button"
        className={styles.floatingAddBtn}
        aria-label={t('subscriptions', 'add')}
        onClick={() => {
          if (!isFormOpen) {
            setName('');
            setAmount('');
            setCycle('monthly');
            setNextChargeDate(new Date().toISOString().slice(0, 10));
            setNote('');
            setEditingId(null);
          }
          setIsFormOpen((prev) => !prev);
        }}
      >
        <Plus size={22} strokeWidth={2.4} />
      </button>
    </div>
  );
};

export default Subscriptions;
