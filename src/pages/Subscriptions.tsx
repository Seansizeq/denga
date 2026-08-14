import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { formatCurrency, type PlannerCurrency } from '../utils/formatters';
import { useTranslation } from '../i18n/LanguageContext';
import { useGoBack } from '../hooks/useGoBack';
import { showAppConfirm } from '../utils/notify';
import { apiFetch } from '../api/client';
import { usePersistedState } from '../hooks/usePersistedState';
import { CATEGORIES, getCustomCategoryName } from '../constants/categories';
import type { CategoryKey } from '../i18n/translations';
import styles from './Subscriptions.module.css';

const SUBSCRIPTIONS_STORAGE_KEY = 'denga_subscriptions_v1';

type BillingCycle = 'monthly' | 'yearly';
type SubscriptionCurrency = PlannerCurrency;

const BUILTIN_EXPENSE_CATEGORIES = CATEGORIES.filter((c) => c.type === 'expense');
const DEFAULT_CATEGORY_ID = 'other_expense';

interface Subscription {
  id: string;
  name: string;
  amount: number;
  currency: SubscriptionCurrency;
  categoryId: string;
  cycle: BillingCycle;
  nextChargeDate: string;
  note?: string;
  active: boolean;
}

const normalizeSubCurrency = (raw: unknown): SubscriptionCurrency =>
  raw === 'PLN' ? 'PLN' : 'UAH';

const normalizeCategoryId = (raw: unknown): string =>
  typeof raw === 'string' && raw.trim() ? raw : DEFAULT_CATEGORY_ID;

const isSubscriptionArray = (v: unknown): v is Subscription[] =>
  Array.isArray(v) &&
  v.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      typeof (item as Subscription).id === 'string' &&
      typeof (item as Subscription).amount === 'number',
  );

const Subscriptions: React.FC = () => {
  const goBack = useGoBack('/');
  const { t, locale } = useTranslation();
  const [items, setItems] = usePersistedState<Subscription[]>(
    SUBSCRIPTIONS_STORAGE_KEY,
    [],
    { validate: isSubscriptionArray },
  );
  const [loading, setLoading] = useState(items.length === 0);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<SubscriptionCurrency>('UAH');
  const [categoryId, setCategoryId] = useState<string>(DEFAULT_CATEGORY_ID);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [nextChargeDate, setNextChargeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [listError, setListError] = useState('');
  const [actionError, setActionError] = useState('');
  const [customCategories, setCustomCategories] = useState<Array<{ id: string; name: string }>>([]);

  const load = useCallback(async () => {
    setListError('');
    try {
      const response = await apiFetch('/api/subscriptions');
      if (!response.ok) {
        setListError(t('subscriptions', 'loadError'));
        return;
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        setItems(
          data.map((sub: Subscription) => ({
            ...sub,
            currency: normalizeSubCurrency(sub.currency),
            categoryId: normalizeCategoryId(sub.categoryId),
          }))
        );
      }
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      setListError(t('subscriptions', 'loadError'));
    } finally {
      setLoading(false);
    }
  }, [t, setItems]);

  useEffect(() => {
    void load();
    apiFetch('/api/custom-categories?type=expense')
      .then((r) => r.ok ? r.json() : [])
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setCustomCategories(data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
        }
      })
      .catch(() => {});
  }, [load]);

  const activeItems = useMemo(() => items.filter((s) => s.active), [items]);
  const disabledItems = useMemo(() => items.filter((s) => !s.active), [items]);

  const monthlyTotals = useMemo(() => {
    const acc: Record<SubscriptionCurrency, number> = { UAH: 0, PLN: 0 };
    for (const s of activeItems) {
      const cur = normalizeSubCurrency(s.currency);
      acc[cur] += s.cycle === 'monthly' ? s.amount : s.amount / 12;
    }
    return acc;
  }, [activeItems]);

  const yearlyTotals = useMemo(() => {
    const acc: Record<SubscriptionCurrency, number> = { UAH: 0, PLN: 0 };
    for (const s of activeItems) {
      const cur = normalizeSubCurrency(s.currency);
      acc[cur] += s.cycle === 'yearly' ? s.amount : s.amount * 12;
    }
    return acc;
  }, [activeItems]);

  const categoryLabel = useCallback(
    (id: string): string => {
      const fromLoaded = customCategories.find((c) => c.id === id);
      if (fromLoaded) return fromLoaded.name;
      const fromLegacy = getCustomCategoryName(id);
      if (fromLegacy) return fromLegacy;
      if (BUILTIN_EXPENSE_CATEGORIES.some((c) => c.id === id)) {
        return t('categories', id as CategoryKey);
      }
      return t('categories', DEFAULT_CATEGORY_ID);
    },
    [t, customCategories],
  );

  const resetForm = useCallback(() => {
    setName('');
    setAmount('');
    setCurrency('UAH');
    setCategoryId(DEFAULT_CATEGORY_ID);
    setCycle('monthly');
    setNextChargeDate(new Date().toISOString().slice(0, 10));
    setNote('');
    setEditingId(null);
    setIsFormOpen(false);
  }, []);

  useEffect(() => {
    if (!isFormOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resetForm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFormOpen, resetForm]);

  /* Сторінка під шитом не має прокручуватись разом із ним. */
  useEffect(() => {
    if (!isFormOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFormOpen]);

  const canSave = useMemo(() => {
    const numericAmount = Number(amount.replace(',', '.'));
    return Boolean(name.trim()) && numericAmount > 0 && Boolean(nextChargeDate);
  }, [amount, name, nextChargeDate]);

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
            currency,
            categoryId,
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
      const normalizedSaved: Subscription = {
        ...saved,
        currency: normalizeSubCurrency(saved.currency),
        categoryId: normalizeCategoryId(saved.categoryId),
      };
      if (editingId) {
        setItems((prev) => prev.map((s) => (s.id === editingId ? { ...s, ...normalizedSaved } : s)));
      } else {
        setItems((prev) => [normalizedSaved, ...prev]);
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
          currency: sub.currency,
          categoryId: sub.categoryId,
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
      const normalized: Subscription = {
        ...updated,
        currency: normalizeSubCurrency(updated.currency),
        categoryId: normalizeCategoryId(updated.categoryId),
      };
      setItems((prev) => prev.map((s) => (s.id === id ? { ...s, ...normalized } : s)));
    } catch (error) {
      console.error('Error enabling subscription:', error);
      setActionError(t('subscriptions', 'saveError'));
    }
  };

  const onDelete = async (id: string) => {
    setActionError('');
    if (!(await showAppConfirm(t('subscriptions', 'deleteConfirm')))) {
      return;
    }
    try {
      const response = await apiFetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        setActionError(t('subscriptions', 'saveError'));
        return;
      }
      setItems((prev) => prev.filter((s) => s.id !== id));
      if (editingId === id) resetForm();
    } catch (error) {
      console.error('Error deleting subscription:', error);
      setActionError(t('subscriptions', 'saveError'));
    }
  };

  const onEdit = (sub: Subscription) => {
    setActionError('');
    setEditingId(sub.id);
    setIsFormOpen(true);
    setName(sub.name);
    setAmount(String(sub.amount));
    setCurrency(normalizeSubCurrency(sub.currency));
    setCategoryId(normalizeCategoryId(sub.categoryId));
    setCycle(sub.cycle);
    setNextChargeDate(sub.nextChargeDate);
    setNote(sub.note ?? '');
  };

  const renderTotals = (totals: Record<SubscriptionCurrency, number>) => {
    const withValue = (['UAH', 'PLN'] as SubscriptionCurrency[]).filter((cur) => totals[cur] > 0);
    const shown = withValue.length > 0 ? withValue : (['UAH'] as SubscriptionCurrency[]);
    return (
      <div className={styles.summaryStack}>
        {shown.map((cur) => (
          <span key={cur} className={styles.summaryValue}>
            {formatCurrency(totals[cur], locale, cur)}
          </span>
        ))}
      </div>
    );
  };

  const renderCard = (sub: Subscription, opts: { showEnable?: boolean }) => {
    const subCurrency = normalizeSubCurrency(sub.currency);
    const yearlyForItem = sub.cycle === 'yearly' ? sub.amount : sub.amount * 12;
    return (
      <article
        key={sub.id}
        className={`${styles.item} ${opts.showEnable ? styles.itemDisabled : ''}`}
      >
        <div className={styles.itemTop}>
          <span className={styles.itemName}>{sub.name}</span>
          <span className={styles.itemAmount}>{formatCurrency(sub.amount, locale, subCurrency)}</span>
        </div>
        <div className={styles.itemMeta}>
          <span>{sub.cycle === 'monthly' ? t('subscriptions', 'monthly') : t('subscriptions', 'yearly')}</span>
          <span>{new Date(sub.nextChargeDate).toLocaleDateString(locale)}</span>
        </div>
        <div className={styles.itemCategoryRow}>
          <span className={styles.itemCategoryChip}>{categoryLabel(sub.categoryId)}</span>
        </div>
        <div className={styles.itemYearlyRow}>
          <span>{t('subscriptions', 'yearlyForItem')}</span>
          <strong>{formatCurrency(yearlyForItem, locale, subCurrency)}</strong>
        </div>
        {sub.note ? <p className={styles.itemNote}>{sub.note}</p> : null}
        <div className={styles.itemActions}>
          {opts.showEnable ? (
            <>
              <button type="button" className={styles.enableBtn} onClick={() => void onEnable(sub.id)}>
                {t('subscriptions', 'enable')}
              </button>
              <button type="button" className={styles.deleteBtn} onClick={() => void onDelete(sub.id)}>
                {t('subscriptions', 'delete')}
              </button>
            </>
          ) : (
            <>
              <button type="button" className={styles.editBtn} onClick={() => onEdit(sub)}>
                {t('subscriptions', 'edit')}
              </button>
              <button type="button" className={styles.disableBtn} onClick={() => void onDisable(sub.id)}>
                {t('subscriptions', 'disable')}
              </button>
              <button type="button" className={styles.deleteBtn} onClick={() => void onDelete(sub.id)}>
                {t('subscriptions', 'delete')}
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
        <button type="button" className={styles.back} onClick={goBack}>
          ← {t('subscriptions', 'back')}
        </button>
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
          {renderTotals(monthlyTotals)}
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('subscriptions', 'yearlyTotal')}</span>
          {renderTotals(yearlyTotals)}
        </div>
      </div>

      <div className={styles.countRow}>
        {t('subscriptions', 'activeCount')}: <strong>{activeItems.length}</strong>
      </div>

      <section className={styles.listSection}>
        {loading ? (
          <p className={styles.emptyText}>{t('common', 'loading')}</p>
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
        <div className={styles.sheetOverlay} role="presentation" onClick={resetForm}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscriptions-form-title"
            className={styles.sheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetGrabber} aria-hidden="true" />
            <header className={styles.sheetHeader}>
              <h2 id="subscriptions-form-title" className={styles.sheetTitle}>
                {editingId ? t('subscriptions', 'edit') : t('subscriptions', 'addTitle')}
              </h2>
              <button
                type="button"
                className={styles.sheetClose}
                onClick={resetForm}
                aria-label={t('addTx', 'cancel')}
              >
                <X size={17} strokeWidth={2.6} />
              </button>
            </header>

            <div className={styles.sheetBody}>
              {actionError ? (
                <p className={styles.formError} role="alert">
                  {actionError}
                </p>
              ) : null}

              <div>
                <div className={styles.amountRow}>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={styles.amountInput}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="0"
                    aria-label={t('subscriptions', 'amount')}
                  />
                  <span className={styles.amountSuffix}>{currency === 'UAH' ? '₴' : 'zł'}</span>
                </div>
                <div
                  className={`${styles.segment} ${styles.segmentCompact}`}
                  role="group"
                  aria-label="Currency"
                >
                  <button
                    type="button"
                    className={styles.segmentBtn}
                    aria-pressed={currency === 'UAH'}
                    onClick={() => setCurrency('UAH')}
                  >
                    ₴
                  </button>
                  <button
                    type="button"
                    className={styles.segmentBtn}
                    aria-pressed={currency === 'PLN'}
                    onClick={() => setCurrency('PLN')}
                  >
                    zł
                  </button>
                </div>
              </div>

              <div className={styles.segment} role="group" aria-label={t('subscriptions', 'cycle')}>
                <button
                  type="button"
                  className={styles.segmentBtn}
                  aria-pressed={cycle === 'monthly'}
                  onClick={() => setCycle('monthly')}
                >
                  {t('subscriptions', 'monthly')}
                </button>
                <button
                  type="button"
                  className={styles.segmentBtn}
                  aria-pressed={cycle === 'yearly'}
                  onClick={() => setCycle('yearly')}
                >
                  {t('subscriptions', 'yearly')}
                </button>
              </div>

              <div className={styles.group}>
                <label className={styles.row}>
                  <span className={styles.rowLabel}>{t('subscriptions', 'name')}</span>
                  <input
                    type="text"
                    className={styles.rowField}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Netflix"
                  />
                </label>

                <label className={styles.row}>
                  <span className={styles.rowLabel}>{t('subscriptions', 'category')}</span>
                  <select
                    className={`${styles.rowField} ${styles.rowSelect}`}
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    {BUILTIN_EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {t('categories', c.id as CategoryKey)}
                      </option>
                    ))}
                    {customCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.row}>
                  <span className={styles.rowLabel}>{t('subscriptions', 'nextChargeDate')}</span>
                  <input
                    type="date"
                    className={`${styles.rowField} ${styles.rowDate}`}
                    value={nextChargeDate}
                    onChange={(e) => setNextChargeDate(e.target.value)}
                  />
                </label>

                <label className={styles.row}>
                  <span className={styles.rowLabel}>{t('subscriptions', 'note')}</span>
                  <input
                    type="text"
                    className={styles.rowField}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="—"
                  />
                </label>
              </div>

              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.submitBtn}
                  disabled={!canSave}
                  onClick={() => void onSave()}
                >
                  {editingId ? t('subscriptions', 'saveChanges') : t('subscriptions', 'add')}
                </button>
                <button type="button" className={styles.cancelBtn} onClick={resetForm}>
                  {editingId ? t('subscriptions', 'cancelEdit') : t('addTx', 'cancel')}
                </button>
              </div>
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
            setCurrency('UAH');
            setCategoryId(DEFAULT_CATEGORY_ID);
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
