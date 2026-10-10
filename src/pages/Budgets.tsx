import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, deleteBudget, getBudgets, setBudget, type CategoryBudget } from '../api/client';
import { CATEGORIES, getCustomCategoryData, inferCustomCategoryColor, inferCustomCategoryIcon } from '../constants/categories';
import { getCategoryIcon } from '../constants/categoryIcons';
import { useToast } from '../components/ui/Toast';
import { useTranslation } from '../i18n/LanguageContext';
import type { CategoryKey } from '../i18n/translations';
import type { DisplayCurrency } from '../utils/formatters';
import styles from './Budgets.module.css';

type CustomRow = { id: string; name: string };

const currencySymbol = (currency: CategoryBudget['currency']) =>
  currency === 'PLN' ? 'zł' : currency === 'USD' ? '$' : '₴';

/** Іконка й колір категорії — ті самі, що в списку операцій і в підписках. */
const categoryVisual = (categoryId: string) => {
  const custom = getCustomCategoryData(categoryId);
  if (custom) {
    return {
      icon: inferCustomCategoryIcon(custom.name, custom.icon),
      color: inferCustomCategoryColor(custom.name, custom.color),
    };
  }
  const builtin = CATEGORIES.find((c) => c.id === categoryId);
  return { icon: builtin?.icon ?? 'Receipt', color: builtin?.color ?? '#8E8E93' };
};

const Budgets: React.FC = () => {
  const { t, displayCurrency } = useTranslation();
  const toast = useToast();
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [customExpense, setCustomExpense] = useState<CustomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [localLimits, setLocalLimits] = useState<Record<string, string>>({});

  const expenseCategories = useMemo(
    () => CATEGORIES.filter((c) => c.type === 'expense'),
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, res] = await Promise.all([
        getBudgets(),
        apiFetch('/api/custom-categories?type=expense'),
      ]);
      setBudgets(b);
      const map: Record<string, string> = {};
      for (const row of b) {
        map[row.categoryId] = String(row.monthlyLimit ?? '');
      }
      setLocalLimits(map);
      if (res.ok) {
        const rows = (await res.json()) as { id: string; name: string }[];
        setCustomExpense(Array.isArray(rows) ? rows.map((r) => ({ id: r.id, name: r.name })) : []);
      } else {
        setCustomExpense([]);
      }
    } catch {
      setBudgets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const built: { id: string; label: string }[] = expenseCategories.map((c) => ({
      id: c.id,
      label: t('categories', c.id as CategoryKey),
    }));
    for (const c of customExpense) {
      built.push({ id: c.id, label: c.name });
    }
    return built;
  }, [expenseCategories, customExpense, t]);

  const savedBudget = (categoryId: string) =>
    budgets.find((x) => x.categoryId === categoryId && Number(x.monthlyLimit) > 0) ?? null;

  /**
   * Збережений ліміт лишається у своїй валюті, і лише новий бере валюту з
   * налаштувань. Раніше рядок підписувався поточною валютою показу: після
   * перемикання на злоті ліміт 5000 ₴ виглядав як «5000 zł» і саме так
   * зберігався, щойно людина торкалася поля, — ліміт мовчки ріс у десятки разів.
   */
  const currencyFor = (categoryId: string): CategoryBudget['currency'] =>
    savedBudget(categoryId)?.currency ?? (displayCurrency as DisplayCurrency);

  const getLimitFor = (categoryId: string) => {
    if (localLimits[categoryId] !== undefined) return localLimits[categoryId];
    const saved = savedBudget(categoryId);
    return saved ? String(saved.monthlyLimit) : '';
  };

  const revertLimit = (categoryId: string) => {
    const saved = savedBudget(categoryId);
    setLocalLimits((prev) => ({ ...prev, [categoryId]: saved ? String(saved.monthlyLimit) : '' }));
  };

  const persist = async (categoryId: string, raw: string) => {
    const saved = savedBudget(categoryId);
    const trimmed = String(raw).trim();
    const n = trimmed === '' ? 0 : parseFloat(trimmed.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) {
      revertLimit(categoryId);
      return;
    }
    // Дотик без правки нічого не надсилає.
    if (n === (saved ? Number(saved.monthlyLimit) : 0)) return;
    try {
      if (n === 0) {
        await deleteBudget(categoryId);
        setBudgets((prev) => prev.filter((x) => x.categoryId !== categoryId));
        setLocalLimits((prev) => ({ ...prev, [categoryId]: '' }));
        return;
      }
      const next = await setBudget(categoryId, n, currencyFor(categoryId));
      setBudgets((prev) => {
        const rest = prev.filter((x) => x.categoryId !== categoryId);
        if (next.monthlyLimit <= 0) return rest;
        return [...rest, next];
      });
      setLocalLimits((prev) => ({ ...prev, [categoryId]: next.monthlyLimit > 0 ? String(next.monthlyLimit) : '' }));
    } catch {
      // Поле не має вдавати, що число збережене.
      revertLimit(categoryId);
      toast.show(t('budgets', 'saveFailed'), { variant: 'error' });
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('budgets', 'title')}</h1>
        <p className={styles.subtitle}>{t('budgets', 'subtitle')}</p>
      </header>

      <p className={styles.hint}>{t('budgets', 'currencyNote')}</p>

      <div className={styles.card}>
        {loading ? (
          <>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.row}>
                <span className={`${styles.skeletonIcon} motion-skeleton`} />
                <span className={`${styles.skeletonName} motion-skeleton`} />
              </div>
            ))}
          </>
        ) : (
          rows.map((row, index) => {
            const visual = categoryVisual(row.id);
            const Icon = getCategoryIcon(visual.icon, 'Receipt');
            const value = getLimitFor(row.id);
            return (
              <label
                key={row.id}
                className={`${styles.row} motion-list-item`}
                style={{ ['--i' as string]: index }}
              >
                <span className={styles.rowIcon} style={{ background: visual.color }}>
                  <Icon size={18} color="#fff" strokeWidth={2} />
                </span>
                <span className={styles.name}>{row.label}</span>
                <input
                  className={`${styles.input} ${value ? styles.inputSet : ''}`}
                  type="text"
                  inputMode="decimal"
                  placeholder="—"
                  value={value}
                  onChange={(e) =>
                    setLocalLimits((prev) => ({
                      ...prev,
                      [row.id]: e.target.value.replace(/[^0-9.,]/g, ''),
                    }))
                  }
                  onBlur={() => void persist(row.id, getLimitFor(row.id))}
                />
                <span className={styles.currency}>{currencySymbol(currencyFor(row.id))}</span>
              </label>
            );
          })
        )}
      </div>
      <p className={styles.hint}>{t('budgets', 'noBudgetHint')}</p>
    </div>
  );
};

export default Budgets;
