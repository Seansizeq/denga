import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { useTranslation } from '../i18n/LanguageContext';
import { apiFetch } from '../api/client';
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
  const [listError, setListError] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setListError('');
    setLoading(true);
    try {
      const response = await apiFetch('/api/subscriptions');
      if (!response.ok) {
        setListError(t('subscriptions', 'loadError'));
        return;
      }
      const data = await response.json();
      if (Array.isArray(data)) setItems(data);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      setListError(t('subscriptions', 'loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeItems = useMemo(() => items.filter((s) => s.active), [items]);
  const disabledItems = useMemo(() => items.filter((s) => !s.active), [items]);

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
    setActionError('');
    const numericAmount = Number(amount.replace(',', '.'));
    if (!name.trim() || !numericAmount || numericAmount <= 0 || !nextChargeDate) return;
    try {
      const response = await apiFetch(
        editingId ? `/api/subscriptions/${editingId}` : '/api/subscriptions',
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
      if (!response.ok) {
        setActionError(t('subscriptions', 'saveError'));
        return;
      }
      const saved = (await response.json()) as Subscription;
      if (editingId) {
        setItems((prev) => prev.map((s) => (s.id === editingId ? { ...s, ...saved } : s)));
      } else {
        setItems((prev) => [saved, ...prev]);
      }
      resetForm();
    } catch (error) {
      console.error('Error saving subscription:', error);
      setActionError(t('subscriptions', 'saveError'));
    }
  };

  const onDisable = async (id: string) => {
    setActionError('');
    try {
      const response = await apiFetch(`/api/subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      });
      if (!response.ok) {
        setActionError(t('subscriptions', 'saveError'));
        return;
      }
      setItems((prev) => prev.map((s) => (s.id === id ? { ...s, active: false } : s)));
    } catch (error) {
      console.error('Error disabling subscription:', error);
      setActionError(t('subscriptions', 'saveError'));
    }
  };

  const onEnable = async (id: string) => {
    setActionError('');
    const sub = items.find((s) => s.id === id);
    if (!sub) return;
    try {
      const response = await apiFetch(`/api/subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sub.name,
          amount: sub.amount,
          cycle: sub.cycle,
          nextChargeDate: sub.nextChargeDate,
          note: sub.note ?? '',
          active: true,
        }),
      });
      if (!response.ok) {
        setActionError(t('subscriptions', 'saveError'));
        return;
      }
      const updated = (await response.json()) as Subscription;
      setItems((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
    } catch (error) {
      console.error('Error enabling subscription:', error);
      setActionError(t('subscriptions', 'saveError'));
    }
  };

  const onEdit = (sub: Subscription) => {
    setActionError('');
    setEditingId(sub.id);
    setIsFormOpen(true);
    setName(sub.name);
    setAmount(String(sub.amount));
    setCycle(sub.cycle);
    setNextChargeDate(sub.nextChargeDate);
    setNote(sub.note ?? '');
  };

  const renderCard = (sub: Subscription, opts: { showEnable?: boolean }) => {
    const yearlyForItem = sub.cycle === 'yearly' ? sub.amount : sub.amount * 12;
    return (
      <article
        key={sub.id}
        className={`${styles.item} ${opts.showEnable ? styles.itemDisabled : ''}`}
      >
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
          {opts.showEnable ? (
            <button type="button" className={styles.enableBtn} onClick={() => void onEnable(sub.id)}>
              {t('subscriptions', 'enable')}
            </button>
          ) : (
            <>
              <button type="button" className={styles.editBtn} onClick={() => onEdit(sub)}>
                {t('subscriptions', 'edit')}
              </button>
              <button type="button" className={styles.disableBtn} onClick={() => void onDisable(sub.id)}>
                {t('subscriptions', 'disable')}
              </button>
            </>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('subscriptions', 'title')}</h1>
        <span className={styles.subtitle}>{t('subscriptions', 'subtitle')}</span>
      </header>

      {listError ? (
        <p className={styles.bannerError} role="alert">
          {listError}
        </p>
      ) : null}
      {actionError ? (
        <p className={styles.bannerError} role="alert">
          {actionError}
        </p>
      ) : null}

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
          <p className={styles.emptyText}>{t('planner', 'loading')}</p>
        ) : activeItems.length === 0 && disabledItems.length === 0 ? (
          <p className={styles.emptyText}>{t('subscriptions', 'empty')}</p>
        ) : null}

        {!loading && activeItems.length > 0 ? <div className={styles.list}>{activeItems.map((sub) => renderCard(sub, {}))}</div> : null}
      </section>

      {!loading && disabledItems.length > 0 ? (
        <section className={styles.listSection}>
          <h2 className={styles.subsectionTitle}>{t('subscriptions', 'disabledSection')}</h2>
          <div className={styles.list}>{disabledItems.map((sub) => renderCard(sub, { showEnable: true }))}</div>
        </section>
      ) : null}

      {isFormOpen ? (
        <div className={styles.modalOverlay} onClick={resetForm}>
          <section className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            {actionError ? <p className={styles.formError}>{actionError}</p> : null}
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
              <button type="button" className={styles.addBtn} onClick={() => void onSave()}>
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
            setActionError('');
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
