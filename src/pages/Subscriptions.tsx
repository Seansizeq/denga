import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Repeat } from 'lucide-react';
import { formatCurrency, type PlannerCurrency } from '../utils/formatters';
import { useTranslation } from '../i18n/LanguageContext';
import { useGoBack } from '../hooks/useGoBack';
import { showAppConfirm } from '../utils/notify';
import { apiFetch } from '../api/client';
import { usePersistedState } from '../hooks/usePersistedState';
import { CATEGORIES, findCategory, getCustomCategoryData, inferCustomCategoryIcon } from '../constants/categories';
import { getCategoryIcon } from '../constants/categoryIcons';
import type { CategoryKey } from '../i18n/translations';
import Switch from '../components/ui/Switch';
import styles from './Subscriptions.module.css';

const getCategoryVisual = (categoryId: string) => {
  const customCategory = getCustomCategoryData(categoryId);
  const category = customCategory ? null : findCategory(categoryId);
  const iconName = customCategory
    ? inferCustomCategoryIcon(customCategory.name, customCategory.icon)
    : category?.icon ?? 'Receipt';
  const color = customCategory?.color ?? category?.color ?? '#8E8E93';
  const IconComponent = getCategoryIcon(iconName, 'Receipt');
  return { IconComponent, color };
};

const formatShortDate = (iso: string, locale: string): string =>
  new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

const computeRenewalLabel = (iso: string, cycle: BillingCycle, locale: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (cycle === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return formatShortDate(d.toISOString().slice(0, 10), locale);
};

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
  const [active, setActive] = useState(true);
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

  const resetForm = useCallback(() => {
    setName('');
    setAmount('');
    setCurrency('UAH');
    setCategoryId(DEFAULT_CATEGORY_ID);
    setCycle('monthly');
    setNextChargeDate(new Date().toISOString().slice(0, 10));
    setActive(true);
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

  /**
   * Telegram сам зменшує вікно під клавіатуру — шит уже стає рівно над нею.
   * Рахувати висоту клавіатури вручну не можна: компенсація накладалася на
   * системну і піднімала шит удвічі вище, аж поки від нього лишалася шапка.
   * Лишається тільки дотягнути поле, на яке щойно натиснули, у видиму частину.
   */
  const scrollFieldIntoView = useCallback((e: React.FocusEvent) => {
    const field = e.target;
    if (!(field instanceof HTMLElement)) return;
    // Із затримкою: до кінця анімації клавіатури висота ще змінюється.
    window.setTimeout(() => field.scrollIntoView({ block: 'nearest' }), 300);
  }, []);

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
            active,
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
    setActive(sub.active);
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

  const renderCard = (sub: Subscription, opts: { muted?: boolean }) => {
    const subCurrency = normalizeSubCurrency(sub.currency);
    const { IconComponent, color } = getCategoryVisual(sub.categoryId);
    const startDate = formatShortDate(sub.nextChargeDate, locale);

    return (
      <button
        key={sub.id}
        type="button"
        className={`${styles.item} ${opts.muted ? styles.itemDisabled : ''}`}
        onClick={() => onEdit(sub)}
      >
        <div className={styles.itemIcon} style={{ background: color }}>
          <IconComponent size={20} color="#fff" strokeWidth={2} />
        </div>
        <div className={styles.itemInfo}>
          <span className={styles.itemName}>{sub.name}</span>
          <span className={styles.itemDate}>
            {t('subscriptions', 'startPrefix')} {startDate}
          </span>
        </div>
        <div className={styles.itemRight}>
          <span className={styles.itemAmount}>{formatCurrency(sub.amount, locale, subCurrency)}</span>
          <span className={styles.itemCycle}>
            {sub.cycle === 'monthly' ? t('subscriptions', 'monthly') : t('subscriptions', 'yearly')}
            <Repeat size={12} strokeWidth={2.2} />
          </span>
        </div>
      </button>
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
          <div className={styles.list}>{disabledItems.map((sub) => renderCard(sub, { muted: true }))}</div>
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
              <button
                type="button"
                className={`${styles.headerPill} ${styles.headerPillGhost}`}
                onClick={resetForm}
              >
                {t('addTx', 'cancel')}
              </button>
              <h2 id="subscriptions-form-title" className={styles.sheetTitle}>
                {editingId ? t('subscriptions', 'edit') : t('subscriptions', 'addTitle')}
              </h2>
              <button
                type="button"
                className={`${styles.headerPill} ${styles.headerPillPrimary}`}
                disabled={!canSave}
                onClick={() => void onSave()}
              >
                {/* Коротко, як в iOS: що саме зберігаємо — написано в заголовку. */}
                {t('addTx', 'save')}
              </button>
            </header>

            <div className={styles.sheetBody} onFocus={scrollFieldIntoView}>
              {actionError ? (
                <p className={styles.formError} role="alert">
                  {actionError}
                </p>
              ) : null}

              <div className={styles.heroCard} style={{ background: getCategoryVisual(categoryId).color }}>
                <div className={styles.heroIcon}>
                  {(() => {
                    const HeroIcon = getCategoryVisual(categoryId).IconComponent;
                    return <HeroIcon size={22} color="#fff" strokeWidth={2} />;
                  })()}
                </div>
                <div className={styles.heroInfo}>
                  <span className={styles.heroName}>{name.trim() || t('subscriptions', 'addTitle')}</span>
                  <span className={styles.heroDate}>
                    {t('subscriptions', 'startPrefix')} {nextChargeDate ? formatShortDate(nextChargeDate, locale) : ''}
                  </span>
                </div>
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
                  <span className={styles.rowLabel}>{t('subscriptions', 'amount')}</span>
                  <div className={styles.amountFieldGroup}>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={styles.amountFieldInput}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                      placeholder="0"
                      aria-label={t('subscriptions', 'amount')}
                    />
                    <span className={styles.amountDivider} aria-hidden="true" />
                    <select
                      className={styles.amountCurrencySelect}
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as SubscriptionCurrency)}
                      aria-label="Currency"
                    >
                      <option value="UAH">₴</option>
                      <option value="PLN">zł</option>
                    </select>
                  </div>
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
              </div>

              <div className={styles.group}>
                <label className={styles.row}>
                  <span className={styles.rowLabel}>{t('subscriptions', 'nextChargeDate')}</span>
                  <input
                    type="date"
                    className={styles.rowDatePill}
                    value={nextChargeDate}
                    onChange={(e) => setNextChargeDate(e.target.value)}
                  />
                </label>

                <div className={`${styles.row} ${styles.rowSwitch}`}>
                  <span className={styles.rowLabel}>{t('subscriptions', 'active')}</span>
                  <Switch checked={active} onChange={setActive} aria-label={t('subscriptions', 'active')} />
                </div>

                <label className={styles.row}>
                  <span className={styles.rowLabel}>{t('subscriptions', 'cycle')}</span>
                  <select
                    className={`${styles.rowField} ${styles.rowSelect}`}
                    value={cycle}
                    onChange={(e) => setCycle(e.target.value as BillingCycle)}
                  >
                    <option value="monthly">{t('subscriptions', 'monthly')}</option>
                    <option value="yearly">{t('subscriptions', 'yearly')}</option>
                  </select>
                </label>
              </div>

              {nextChargeDate ? (
                <p className={styles.groupCaption}>
                  {t('subscriptions', 'renewCaption')
                    .replace('{start}', formatShortDate(nextChargeDate, locale))
                    .replace('{next}', computeRenewalLabel(nextChargeDate, cycle, locale))
                    .replace(
                      '{amount}',
                      formatCurrency(Number(amount.replace(',', '.')) || 0, locale, currency),
                    )}
                </p>
              ) : null}

              <div className={styles.group}>
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

              {editingId ? (
                <button type="button" className={styles.deleteRow} onClick={() => void onDelete(editingId)}>
                  {t('subscriptions', 'delete')}
                </button>
              ) : null}
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
            setActive(true);
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
