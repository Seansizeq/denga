import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { X } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import CategoryGrid from '../components/ui/CategoryGrid';
import {
  createCustomCategoryId,
  CUSTOM_CATEGORY_COLORS,
  CUSTOM_CATEGORY_ICONS,
  inferCustomCategoryColor,
  inferCustomCategoryIcon,
  type CustomCategoryIcon,
} from '../constants/categories';
import { useTranslation } from '../i18n/LanguageContext';
import type { Language } from '../i18n/translations';
import type { TransactionType } from '../types';
import {
  ACCOUNT_NOTE_KEYS,
  getAccountSlugFromNote,
  mergeAccountIntoNoteLimited,
  stripAccountFromNote,
  type AccountNoteKey,
} from '../utils/transactionAccount';
import { normalizeCurrency, SUPPORTED_CURRENCIES, type CurrencyCode } from '../utils/currency';
import { apiFetch } from '../api/client';
import { useExpenseTemplates, type ExpenseTemplate } from '../hooks/useExpenseTemplates';
import ExpenseTemplateBar from '../components/ExpenseTemplateBar';
import styles from './AddTransaction.module.css';

const iconRegistry = LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>>;

const ACCOUNT_CHIP_LABELS: Record<AccountNoteKey, Record<Language, string>> = {
  pumb: { uk: 'PUMB', ru: 'PUMB', en: 'PUMB' },
  privat24: { uk: 'Privat24', ru: 'Privat24', en: 'Privat24' },
  wallet: { uk: 'Готівка', ru: 'Наличные', en: 'Cash' },
  crypto: { uk: 'Crypto', ru: 'Крипто', en: 'Crypto' },
  sol: { uk: 'SOL', ru: 'SOL', en: 'SOL' },
  ton: { uk: 'TON', ru: 'TON', en: 'TON' },
  usdt: { uk: 'USDT', ru: 'USDT', en: 'USDT' },
  misha: { uk: 'Борг', ru: 'Долг', en: 'Debt' },
};

const AddTransaction: React.FC = () => {
  const navigate = useNavigate();
  const { transactions, addTransaction, updateTransaction } = useTransactions();
  const { t, language } = useTranslation();
  const [searchParams] = useSearchParams();
  const { templates, saveTemplate, deleteTemplate } = useExpenseTemplates();
  const editId = searchParams.get('edit')?.trim() ?? '';
  const editingTransaction = editId ? transactions.find((tx) => tx.id === editId) : undefined;
  const isEditing = Boolean(editId);

  const initialType: TransactionType =
    editingTransaction?.type
    ?? (searchParams.get('type') === 'income'
      ? 'income'
      : searchParams.get('type') === 'transfer'
        ? 'transfer'
        : 'expense');

  const prefillAmountRaw = !isEditing ? searchParams.get('amount')?.trim() ?? '' : '';
  const prefillCurrencyRaw = !isEditing ? searchParams.get('currency') ?? '' : '';
  const prefillCategoryRaw = !isEditing ? searchParams.get('categoryId')?.trim() ?? '' : '';
  const prefillDateRaw = !isEditing ? searchParams.get('date')?.trim() ?? '' : '';
  const prefillNoteRaw = !isEditing ? (searchParams.get('note') ?? '').slice(0, 120) : '';

  const [amount, setAmount] = useState(() => {
    if (editingTransaction) return String(editingTransaction.amount);
    if (prefillAmountRaw) {
      const parsed = Number(prefillAmountRaw.replace(',', '.'));
      if (Number.isFinite(parsed) && parsed > 0) return String(parsed);
    }
    return '';
  });
  const [currency, setCurrency] = useState<CurrencyCode>(() => {
    if (editingTransaction) return normalizeCurrency(editingTransaction.currency);
    if (prefillCurrencyRaw) return normalizeCurrency(prefillCurrencyRaw);
    return normalizeCurrency(undefined);
  });
  const [type, setType] = useState<TransactionType>(initialType);
  const [date, setDate] = useState(() => {
    const fromEdit = editingTransaction?.date?.slice(0, 10);
    if (fromEdit && /^\d{4}-\d{2}-\d{2}$/.test(fromEdit)) return fromEdit;
    if (prefillDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(prefillDateRaw)) return prefillDateRaw;
    return new Date().toISOString().slice(0, 10);
  });
  const [categoryId, setCategoryId] = useState(() => {
    if (editingTransaction) return editingTransaction.categoryId;
    if (prefillCategoryRaw) return prefillCategoryRaw;
    if (initialType === 'income') return 'salary';
    if (initialType === 'transfer') return 'transfer';
    return 'food';
  });
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState<CustomCategoryIcon>('Tag');
  const [newCategoryColor, setNewCategoryColor] = useState('#8E8E93');
  const [note, setNote] = useState(() => {
    if (editingTransaction) return stripAccountFromNote(editingTransaction.note ?? '');
    if (prefillNoteRaw) return stripAccountFromNote(prefillNoteRaw);
    return '';
  });
  const [paymentAccount, setPaymentAccount] = useState<string>(() => getAccountSlugFromNote(editingTransaction?.note) ?? '');
  const [saveError, setSaveError] = useState('');
  const hydratedEditRef = useRef<string>('');
  const [customCategories, setCustomCategories] = useState<
    Array<{ id: string; name: string; icon: string; color: string }>
  >([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, { name?: string; icon?: string; color?: string }>>({});
  const [managingCustom, setManagingCustom] = useState<
    { id: string; name: string; icon: string; color: string; isCustom: boolean } | null
  >(null);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [portfolioAccounts, setPortfolioAccounts] = useState<Array<{ key: string; name: string; currency: CurrencyCode }>>([]);
  const [transferFromAccountKey, setTransferFromAccountKey] = useState(() => editingTransaction?.fromAccountKey ?? '');
  const [transferToAccountKey, setTransferToAccountKey] = useState(() => editingTransaction?.toAccountKey ?? '');
  const [transferToAmount, setTransferToAmount] = useState(() => {
    if (editingTransaction?.transferToAmount && editingTransaction.transferToAmount > 0) {
      return String(editingTransaction.transferToAmount);
    }
    if (editingTransaction?.type === 'transfer') return String(editingTransaction.amount);
    return '';
  });

  const allowedPaymentKeys = useMemo(() => {
    const s = new Set<string>([...ACCOUNT_NOTE_KEYS]);
    portfolioAccounts.forEach((r) => s.add(r.key));
    return s;
  }, [portfolioAccounts]);

  const paymentChipOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; label: string }[] = [];
    for (const r of portfolioAccounts) {
      if (!r.key || seen.has(r.key)) continue;
      seen.add(r.key);
      out.push({ key: r.key, label: r.name });
    }
    for (const k of ACCOUNT_NOTE_KEYS) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ key: k, label: ACCOUNT_CHIP_LABELS[k][language] });
    }
    return out;
  }, [portfolioAccounts, language]);

  const transferFromAccount = useMemo(
    () => portfolioAccounts.find((account) => account.key === transferFromAccountKey) ?? null,
    [portfolioAccounts, transferFromAccountKey]
  );
  const transferToAccount = useMemo(
    () => portfolioAccounts.find((account) => account.key === transferToAccountKey) ?? null,
    [portfolioAccounts, transferToAccountKey]
  );
  const transferUsesExchange = Boolean(
    transferFromAccount &&
      transferToAccount &&
      transferFromAccount.currency !== transferToAccount.currency
  );

  useEffect(() => {
    let cancelled = false;
    const loadPortfolio = async () => {
      try {
        const res = await apiFetch('/api/accounts');
        if (!res.ok || cancelled) return;
        const data: unknown = await res.json();
        if (!Array.isArray(data) || cancelled) return;
        const list: Array<{ key: string; name: string; currency: CurrencyCode }> = [];
        for (const row of data) {
          if (!row || typeof row !== 'object') continue;
          const r = row as Record<string, unknown>;
          const key = String(r.accountKey ?? '')
            .trim()
            .toLowerCase();
          if (!key) continue;
          const name = String(r.name ?? r.accountKey ?? '')
            .trim()
            .slice(0, 40);
          list.push({
            key,
            name: name || key,
            currency: normalizeCurrency(typeof r.primaryCurrency === 'string' ? r.primaryCurrency : undefined),
          });
        }
        list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        if (!cancelled) setPortfolioAccounts(list);
      } catch {
        if (!cancelled) setPortfolioAccounts([]);
      }
    };
    void loadPortfolio();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadCustomCategories = async () => {
      if (type === 'transfer') {
        setCustomCategories([]);
        return;
      }
      try {
        const response = await apiFetch(`/api/custom-categories?type=${type}`);
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && Array.isArray(data)) {
          setCustomCategories(
            data.map((category) => ({
              ...category,
              icon: inferCustomCategoryIcon(String(category.name ?? ''), String(category.icon ?? '')),
              color: inferCustomCategoryColor(String(category.name ?? ''), String(category.color ?? '')),
            }))
          );
        }
      } catch (error) {
        console.error('Error fetching custom categories:', error);
      }
    };
    loadCustomCategories();
    return () => {
      cancelled = true;
    };
  }, [type]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('category_overrides_v1');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') setCategoryOverrides(parsed);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('category_overrides_v1', JSON.stringify(categoryOverrides));
  }, [categoryOverrides]);

  useEffect(() => {
    if (!editId) {
      hydratedEditRef.current = '';
      return;
    }
    if (hydratedEditRef.current === editId) return;
    const tx = transactions.find((x) => x.id === editId);
    if (!tx) return;
    hydratedEditRef.current = editId;
    setAmount(String(tx.amount));
    setCurrency(normalizeCurrency(tx.currency));
    setType(tx.type);
    setDate(tx.date.slice(0, 10));
    setCategoryId(tx.categoryId);
    setPaymentAccount(getAccountSlugFromNote(tx.note) ?? '');
    setTransferFromAccountKey(tx.fromAccountKey ?? '');
    setTransferToAccountKey(tx.toAccountKey ?? '');
    setTransferToAmount(
      tx.transferToAmount && tx.transferToAmount > 0
        ? String(tx.transferToAmount)
        : tx.type === 'transfer'
          ? String(tx.amount)
          : ''
    );
    setNote(stripAccountFromNote(tx.note ?? ''));
  }, [editId, transactions]);

  useEffect(() => {
    if (!editId) setPaymentAccount('');
  }, [editId]);

  useEffect(() => {
    if (type !== 'transfer') return;
    if (!transferFromAccountKey && portfolioAccounts.length > 0) {
      setTransferFromAccountKey(portfolioAccounts[0].key);
    }
    if (!transferToAccountKey && portfolioAccounts.length > 1) {
      const fallback = portfolioAccounts.find((account) => account.key !== transferFromAccountKey) ?? portfolioAccounts[0];
      if (fallback) setTransferToAccountKey(fallback.key);
    }
  }, [type, portfolioAccounts, transferFromAccountKey, transferToAccountKey]);

  useEffect(() => {
    if (type !== 'transfer' || !transferFromAccount) return;
    setCurrency(transferFromAccount.currency);
  }, [type, transferFromAccount]);

  useEffect(() => {
    if (type !== 'transfer' || transferUsesExchange) return;
    if (!amount) {
      setTransferToAmount('');
      return;
    }
    setTransferToAmount(amount);
  }, [type, transferUsesExchange, amount]);

  const canCreateCustomCategory = newCategoryName.trim().length > 0;

  const handleSave = async () => {
    setSaveError('');
    const numAmount = parseFloat(amount.replace(',', '.'));
    if (!numAmount || numAmount <= 0) return;
    const transferDestinationAmount = parseFloat(transferToAmount.replace(',', '.'));
    const mergedNote = mergeAccountIntoNoteLimited(note.trim(), paymentAccount, allowedPaymentKeys);
    const payload = type === 'transfer'
      ? {
          amount: numAmount,
          currency: transferFromAccount?.currency ?? currency,
          type,
          categoryId: 'transfer',
          date,
          note: note.trim() || undefined,
          fromAccountKey: transferFromAccountKey || undefined,
          toAccountKey: transferToAccountKey || undefined,
          transferToAmount:
            Number.isFinite(transferDestinationAmount) && transferDestinationAmount > 0
              ? transferDestinationAmount
              : numAmount,
          transferToCurrency: transferToAccount?.currency ?? transferFromAccount?.currency ?? currency,
        }
      : {
          amount: numAmount,
          currency,
          type,
          categoryId,
          date,
          note: mergedNote || undefined,
        };
    const ok = isEditing && editId ? await updateTransaction(editId, payload) : await addTransaction(payload);
    if (!ok) {
      setSaveError(t('addTx', 'saveFailed'));
      return;
    }
    navigate('/');
  };

  const handleApplyTemplate = useCallback((tpl: ExpenseTemplate) => {
    if (tpl.amount != null && tpl.amount > 0) setAmount(String(tpl.amount));
    setCurrency(tpl.currency);
    setCategoryId(tpl.categoryId);
    if (tpl.note !== undefined) setNote(tpl.note);
    if (tpl.account !== undefined) setPaymentAccount(tpl.account);
  }, []);

  const handleSaveTemplate = useCallback((name: string) => {
    const numAmount = parseFloat(amount.replace(',', '.'));
    saveTemplate({
      name,
      type,
      amount: Number.isFinite(numAmount) && numAmount > 0 ? numAmount : undefined,
      currency,
      categoryId,
      note: note.trim() || undefined,
      account: paymentAccount || undefined,
    });
  }, [amount, type, currency, categoryId, note, paymentAccount, saveTemplate]);

  const isValid = useMemo(() => {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!(parsedAmount > 0)) return false;
    if (type !== 'transfer') return true;
    if (!transferFromAccountKey || !transferToAccountKey || transferFromAccountKey === transferToAccountKey) {
      return false;
    }
    const parsedDestination = parseFloat(transferToAmount.replace(',', '.'));
    return parsedDestination > 0;
  }, [amount, type, transferFromAccountKey, transferToAccountKey, transferToAmount]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className={styles.closeBtn}
          aria-label={t('addTx', 'cancel')}
        >
          <X size={20} strokeWidth={2.5} />
        </button>
        <h2 className={styles.title}>{isEditing ? t('addTx', 'editTitle') : t('addTx', 'title')}</h2>
        <span className={styles.headerSpacer} aria-hidden="true" />
      </header>

      {saveError ? (
        <p className={styles.saveError} role="alert">
          {saveError}
        </p>
      ) : null}

      <div className={styles.typeSelector}>
        <button
          type="button"
          className={`${styles.typeBtn} ${type === 'expense' ? styles.active : ''}`}
          onClick={() => {
            setType('expense');
            setCategoryId('food');
            setIsCreatingCustom(false);
          }}
        >
          {t('addTx', 'expense')}
        </button>
        <button
          type="button"
          className={`${styles.typeBtn} ${type === 'income' ? styles.active : ''}`}
          onClick={() => {
            setType('income');
            setCategoryId('salary');
            setIsCreatingCustom(false);
          }}
        >
          {t('addTx', 'income')}
        </button>
        <button
          type="button"
          className={`${styles.typeBtn} ${type === 'transfer' ? styles.active : ''}`}
          onClick={() => {
            setType('transfer');
            setCategoryId('transfer');
            setIsCreatingCustom(false);
          }}
        >
          {t('categories', 'transfer')}
        </button>
      </div>

      {type === 'transfer' ? (
        <>
          <section className={styles.noteSection}>
            <h3 className={styles.sectionTitle}>{t('addTx', 'paymentAccount')}</h3>
            <div className={styles.transferGrid}>
              <label className={styles.transferField}>
                <span className={styles.transferLabel}>{t('addTx', 'expense')}</span>
                <select
                  className={styles.noteInput}
                  value={transferFromAccountKey}
                  onChange={(e) => setTransferFromAccountKey(e.target.value)}
                >
                  <option value="">{t('addTx', 'paymentAccountNone')}</option>
                  {portfolioAccounts.map((account) => (
                    <option key={account.key} value={account.key}>
                      {account.name} ({account.currency})
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.transferField}>
                <span className={styles.transferLabel}>{t('addTx', 'income')}</span>
                <select
                  className={styles.noteInput}
                  value={transferToAccountKey}
                  onChange={(e) => setTransferToAccountKey(e.target.value)}
                >
                  <option value="">{t('addTx', 'paymentAccountNone')}</option>
                  {portfolioAccounts.map((account) => (
                    <option key={account.key} value={account.key}>
                      {account.name} ({account.currency})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {transferUsesExchange ? (
              <p className={styles.paymentHint}>
                {`${transferFromAccount?.currency ?? currency} -> ${transferToAccount?.currency ?? currency}`}
              </p>
            ) : null}
          </section>

          <div className={styles.transferAmounts}>
            <div className={styles.amountContainer}>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                placeholder={t('addTx', 'amountPlaceholder')}
                value={amount}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.,]/g, '');
                  setAmount(v);
                }}
                className={styles.amountInput}
                autoFocus
              />
              <div className={styles.currencySelect}>{transferFromAccount?.currency ?? currency}</div>
            </div>

            <div className={styles.amountContainer}>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                placeholder={t('addTx', 'amountPlaceholder')}
                value={transferToAmount}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.,]/g, '');
                  setTransferToAmount(v);
                }}
                className={styles.amountInput}
              />
              <div className={styles.currencySelect}>{transferToAccount?.currency ?? transferFromAccount?.currency ?? currency}</div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className={styles.amountContainer}>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              placeholder={t('addTx', 'amountPlaceholder')}
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.,]/g, '');
                setAmount(v);
              }}
              className={styles.amountInput}
              autoFocus
            />
            <select
              className={styles.currencySelect}
              value={currency}
              onChange={(e) => setCurrency(normalizeCurrency(e.target.value))}
              aria-label={t('settings', 'currency')}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <ExpenseTemplateBar
            templates={templates}
            currentType={type}
            canSave={isValid && !isEditing}
            onApply={handleApplyTemplate}
            onDelete={deleteTemplate}
            onSave={handleSaveTemplate}
            labels={{
              title: t('addTx', 'templates'),
              saveAsTemplate: t('addTx', 'saveAsTemplate'),
              namePlaceholder: t('addTx', 'templateNamePlaceholder'),
            }}
          />

          <section className={styles.paymentSection} aria-label={t('addTx', 'paymentAccount')}>
            <h3 className={styles.sectionTitle}>{t('addTx', 'paymentAccount')}</h3>
            <p className={styles.paymentHint}>{t('addTx', 'paymentAccountHint')}</p>
            <div className={styles.paymentChips}>
              <button
                type="button"
                className={`${styles.paymentChip} ${paymentAccount === '' ? styles.paymentChipActive : ''}`}
                onClick={() => setPaymentAccount('')}
              >
                {t('addTx', 'paymentAccountNone')}
              </button>
              {paymentChipOptions.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.paymentChip} ${paymentAccount === key ? styles.paymentChipActive : ''}`}
                  onClick={() => setPaymentAccount(paymentAccount === key ? '' : key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.categorySection}>
        <h3 className={styles.sectionTitle}>{t('addTx', 'category')}</h3>

        <CategoryGrid
          type={type}
          selectedId={categoryId}
          customCategories={customCategories}
          categoryOverrides={categoryOverrides}
          onAddCustom={() => {
            setIsCreatingCustom(true);
            setEditingCustomId(null);
            setManagingCustom(null);
            setNewCategoryName('');
            setNewCategoryIcon('Tag');
            setNewCategoryColor('#8E8E93');
          }}
          onSelect={(id) => {
            setCategoryId(id);
            setIsCreatingCustom(false);
          }}
          onManageCategory={(category) => {
            setManagingCustom(category);
            setIsCreatingCustom(false);
          }}
        />

        {managingCustom && !isCreatingCustom ? (
          <div className={styles.customCategoryCard}>
            <h4 className={styles.customCategoryTitle}>{managingCustom.name}</h4>
            <div className={styles.customCategoryActions}>
              <button
                type="button"
                className={styles.customCategoryCancelBtn}
                onClick={() => {
                  setCategoryId(managingCustom.id);
                  setManagingCustom(null);
                }}
              >
                {t('addTx', 'categoryTabSelect')}
              </button>
              <button
                type="button"
                className={styles.customCategoryCancelBtn}
                onClick={() => {
                  setIsCreatingCustom(true);
                  setEditingCustomId(managingCustom.isCustom ? managingCustom.id : null);
                  setNewCategoryName(managingCustom.name);
                  setNewCategoryIcon(inferCustomCategoryIcon(managingCustom.name, managingCustom.icon));
                  setNewCategoryColor(managingCustom.color || '#8E8E93');
                }}
              >
                {t('history', 'edit')}
              </button>
              {managingCustom.isCustom ? (
                <button
                  type="button"
                  className={styles.customCategoryCreateBtn}
                  onClick={async () => {
                    if (!window.confirm(t('addTx', 'deleteConfirm'))) return;
                    try {
                      const response = await apiFetch(`/api/custom-categories/${encodeURIComponent(managingCustom.id)}`, {
                        method: 'DELETE',
                      });
                      if (response.ok) {
                        setCustomCategories((prev) => prev.filter((c) => c.id !== managingCustom.id));
                        if (categoryId === managingCustom.id) {
                          setCategoryId(type === 'income' ? 'salary' : 'food');
                        }
                        setManagingCustom(null);
                      }
                    } catch (error) {
                      console.error('Error deleting custom category:', error);
                    }
                  }}
                >
                  {t('history', 'delete')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {isCreatingCustom ? (
          <div className={styles.customCategoryCard}>
            <h4 className={styles.customCategoryTitle}>
              {editingCustomId ? t('addTx', 'saveChanges') : t('addTx', 'createCategory')}
            </h4>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder={t('addTx', 'customCategoryPlaceholder')}
              className={styles.customCategoryInput}
              maxLength={40}
            />
            <p className={styles.iconPickerLabel}>{t('addTx', 'chooseIcon')}</p>
            <div className={styles.iconPickerGrid}>
              {CUSTOM_CATEGORY_ICONS.map((iconName) => {
                const IconComponent = iconRegistry[iconName] ?? LucideIcons.Tag;
                const selected = newCategoryIcon === iconName;
                return (
                  <button
                    key={iconName}
                    type="button"
                    className={`${styles.iconPickBtn} ${selected ? styles.iconPickBtnSelected : ''}`}
                    onClick={() => setNewCategoryIcon(iconName)}
                  >
                    <IconComponent size={20} strokeWidth={1.8} />
                  </button>
                );
              })}
            </div>
            <p className={styles.iconPickerLabel}>{t('addTx', 'chooseColor')}</p>
            <div className={styles.colorPickerGrid}>
              {CUSTOM_CATEGORY_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.colorPickBtn} ${newCategoryColor === color ? styles.colorPickBtnSelected : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setNewCategoryColor(color)}
                />
              ))}
            </div>
            <div className={styles.customCategoryActions}>
              <button
                type="button"
                className={styles.customCategoryCancelBtn}
                onClick={() => {
                  setIsCreatingCustom(false);
                  setEditingCustomId(null);
                }}
              >
                {t('addTx', 'cancel')}
              </button>
              <button
                type="button"
                className={styles.customCategoryCreateBtn}
                disabled={!canCreateCustomCategory || creatingCategory}
                onClick={async () => {
                  if (!canCreateCustomCategory || creatingCategory) return;
                  setCreatingCategory(true);
                  const cleanName = newCategoryName.trim().replace(/\s+/g, ' ');
                  const fallbackId = createCustomCategoryId(
                    cleanName,
                    newCategoryIcon,
                    newCategoryColor
                  );
                  try {
                    const isEdit = Boolean(editingCustomId);
                    const isBuiltInEdit = Boolean(managingCustom && !managingCustom.isCustom);
                    const endpoint = isEdit
                      ? `/api/custom-categories/${encodeURIComponent(editingCustomId as string)}`
                      : '/api/custom-categories';
                    const response = await apiFetch(endpoint, {
                      method: isEdit ? 'PATCH' : 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: cleanName,
                        icon: newCategoryIcon,
                        color: newCategoryColor,
                        type,
                      }),
                    });
                    const saved = response.ok ? await response.json() : null;
                    if (isBuiltInEdit && managingCustom) {
                      setCategoryOverrides((prev) => ({
                        ...prev,
                        [managingCustom.id]: {
                          name: cleanName,
                          icon: newCategoryIcon,
                          color: newCategoryColor,
                        },
                      }));
                      setCategoryId(managingCustom.id);
                    } else {
                      const nextId = saved?.id ?? fallbackId;
                      setCategoryId(nextId);
                      setCustomCategories((prev) => {
                        const withoutOld = editingCustomId ? prev.filter((c) => c.id !== editingCustomId) : prev;
                        const exists = withoutOld.some((c) => c.id === nextId);
                        if (exists) {
                          return withoutOld.map((c) =>
                            c.id === nextId
                              ? {
                                  ...c,
                                  name: saved?.name ?? cleanName,
                                  icon: saved?.icon ?? newCategoryIcon,
                                  color: saved?.color ?? newCategoryColor,
                                }
                              : c
                          );
                        }
                        return [{
                          id: nextId,
                          name: saved?.name ?? cleanName,
                          icon: saved?.icon ?? newCategoryIcon,
                          color: saved?.color ?? newCategoryColor,
                        }, ...withoutOld];
                      });
                    }
                  } catch (error) {
                    console.error('Error creating custom category:', error);
                    setCategoryId(fallbackId);
                  }
                  setNewCategoryName('');
                  setNewCategoryIcon('Tag');
                  setNewCategoryColor('#8E8E93');
                  setIsCreatingCustom(false);
                  setManagingCustom(null);
                  setEditingCustomId(null);
                  setCreatingCategory(false);
                }}
              >
                {editingCustomId ? t('addTx', 'saveChanges') : t('addTx', 'create')}
              </button>
            </div>
          </div>
        ) : null}
          </section>
        </>
      )}

      <section className={styles.noteSection}>
        <h3 className={styles.sectionTitle}>{t('goals', 'contributionDate')}</h3>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={styles.noteInput}
        />
      </section>

      <section className={styles.noteSection}>
        <h3 className={styles.sectionTitle}>{t('addTx', 'note')}</h3>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('addTx', 'notePlaceholder')}
          className={styles.noteInput}
          maxLength={120}
        />
      </section>

      <div className={styles.saveBarSpacer} aria-hidden="true" />

      <div className={styles.saveBar}>
        <button
          type="button"
          onClick={handleSave}
          className={styles.saveBtn}
          disabled={!isValid}
        >
          {isEditing ? t('addTx', 'saveChanges') : t('addTx', 'save')}
        </button>
      </div>
    </div>
  );
};

export default AddTransaction;
