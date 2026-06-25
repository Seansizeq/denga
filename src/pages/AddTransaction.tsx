import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { X, ChevronRight } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import { usePortfolio } from '../context/PortfolioContext';
import CategoryGrid from '../components/ui/CategoryGrid';
import BottomSheet from '../components/ui/BottomSheet';
import OptionPickerSheet from '../components/ui/OptionPickerSheet';
import {
  createCustomCategoryId,
  CUSTOM_CATEGORY_COLORS,
  CUSTOM_CATEGORY_ICONS,
  inferCustomCategoryColor,
  inferCustomCategoryIcon,
  getCustomCategoryData,
  CATEGORIES,
  type CustomCategoryIcon,
} from '../constants/categories';
import { useTranslation } from '../i18n/LanguageContext';
import type { CategoryKey } from '../i18n/translations';
import type { TransactionType } from '../types';
import {
  getAccountSlugFromNote,
  mergeAccountIntoNoteLimited,
  stripAccountFromNote,
} from '../utils/transactionAccount';
import { normalizeCurrency, SUPPORTED_CURRENCIES, type CurrencyCode } from '../utils/currency';
import { apiFetch } from '../api/client';
import { useExpenseTemplates, type ExpenseTemplate } from '../hooks/useExpenseTemplates';
import { usePaymentAccountOptions } from '../hooks/usePaymentAccountOptions';
import {
  hasPrefillParams,
  loadAddTransactionDefaults,
  saveAddTransactionDefaults,
} from '../utils/addTransactionDefaults';
import { resolveCategoryForTypeChange } from '../utils/categoryForType';
import ExpenseTemplateBar from '../components/ExpenseTemplateBar';
import styles from './AddTransaction.module.css';

const iconRegistry = LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>>;

const AddTransaction: React.FC = () => {
  const navigate = useNavigate();
  const { transactions, addTransaction, updateTransaction, isBootstrapping } = useTransactions();
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
  const prefillAccountRaw = !isEditing ? searchParams.get('account')?.trim().toLowerCase() ?? '' : '';

  const initialPaymentAccount = (() => {
    if (editingTransaction) return getAccountSlugFromNote(editingTransaction.note) ?? '';
    if (prefillAccountRaw) return prefillAccountRaw;
    return getAccountSlugFromNote(prefillNoteRaw) ?? '';
  })();

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
  const [paymentAccount, setPaymentAccount] = useState<string>(initialPaymentAccount);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [transferAccountSheet, setTransferAccountSheet] = useState<'from' | 'to' | null>(null);
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
  const { accounts: rawAccounts } = usePortfolio();
  const portfolioAccounts = useMemo<Array<{ key: string; name: string; currency: CurrencyCode }>>(
    () => {
      const list: Array<{ key: string; name: string; currency: CurrencyCode }> = [];
      for (const row of rawAccounts) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const key = String(r.accountKey ?? '').trim().toLowerCase();
        if (!key) continue;
        const name = String(r.name ?? r.accountKey ?? '').trim().slice(0, 40);
        list.push({
          key,
          name: name || key,
          currency: normalizeCurrency(typeof r.primaryCurrency === 'string' ? r.primaryCurrency : undefined),
        });
      }
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      return list;
    },
    [rawAccounts],
  );
  const [transferFromAccountKey, setTransferFromAccountKey] = useState(() => editingTransaction?.fromAccountKey ?? '');
  const [transferToAccountKey, setTransferToAccountKey] = useState(() => editingTransaction?.toAccountKey ?? '');
  const [transferToAmount, setTransferToAmount] = useState(() => {
    if (editingTransaction?.transferToAmount && editingTransaction.transferToAmount > 0) {
      return String(editingTransaction.transferToAmount);
    }
    if (editingTransaction?.type === 'transfer') return String(editingTransaction.amount);
    return '';
  });
  const [transferFromCurrencyOverride, setTransferFromCurrencyOverride] = useState<string>(
    () => editingTransaction?.type === 'transfer' ? (editingTransaction.currency ?? '') : ''
  );

  const { allowedPaymentKeys, paymentChipOptions } = usePaymentAccountOptions(portfolioAccounts, language);

  const editNotFound = isEditing && !isBootstrapping && !editingTransaction;
  const customCategoryIds = useMemo(() => customCategories.map((c) => c.id), [customCategories]);

  const transferFromAccount = useMemo(
    () => portfolioAccounts.find((account) => account.key === transferFromAccountKey) ?? null,
    [portfolioAccounts, transferFromAccountKey]
  );
  const transferToAccount = useMemo(
    () => portfolioAccounts.find((account) => account.key === transferToAccountKey) ?? null,
    [portfolioAccounts, transferToAccountKey]
  );
  const effectiveFromCurrencyStr = transferFromCurrencyOverride || transferFromAccount?.currency || currency;
  const effectiveToCurrencyStr = transferToAccount?.currency ?? transferFromAccount?.currency ?? currency;
  const transferUsesExchange = effectiveFromCurrencyStr !== effectiveToCurrencyStr;

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
    if (isEditing || hasPrefillParams(searchParams, isEditing)) return;
    const defaults = loadAddTransactionDefaults();
    if (!defaults) return;
    if (defaults.currency) setCurrency(normalizeCurrency(defaults.currency));
    if (defaults.paymentAccount) setPaymentAccount(defaults.paymentAccount);
    if (defaults.type && defaults.type !== 'transfer') setType(defaults.type);
    if (defaults.categoryId && defaults.type && defaults.type !== 'transfer') {
      setCategoryId(defaults.categoryId);
    }
  }, [isEditing, searchParams]);

  useEffect(() => {
    if (type !== 'transfer' || portfolioAccounts.length === 0) return;
    const resolvedFromKey = transferFromAccountKey || portfolioAccounts[0].key;
    if (!transferFromAccountKey) {
      setTransferFromAccountKey(resolvedFromKey);
    }
    if (!transferToAccountKey) {
      const fallback = portfolioAccounts.find((a) => a.key !== resolvedFromKey) ?? null;
      if (fallback) setTransferToAccountKey(fallback.key);
    }
  }, [type, portfolioAccounts, transferFromAccountKey, transferToAccountKey]);

  useEffect(() => {
    if (type !== 'transfer' || !transferFromAccount) return;
    setCurrency(transferFromAccount.currency);
    setTransferFromCurrencyOverride('');
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

  const handleClose = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  }, [navigate]);

  const handleTypeChange = useCallback(
    (newType: TransactionType) => {
      setType(newType);
      setIsCreatingCustom(false);
      setManagingCustom(null);
      setCategorySheetOpen(false);
      setCategoryId((current) =>
        resolveCategoryForTypeChange(current, newType, customCategoryIds),
      );
    },
    [customCategoryIds],
  );

  const getCategoryDisplayName = useCallback(
    (id: string): string => {
      if (!id) return '';
      const custom = customCategories.find((c) => c.id === id);
      if (custom) return custom.name;
      const customData = getCustomCategoryData(id);
      if (customData) return customData.name;
      const override = categoryOverrides[id];
      if (override?.name?.trim()) return override.name.trim();
      const builtIn = CATEGORIES.find((c) => c.id === id);
      if (builtIn) return t('categories', id as CategoryKey);
      return id;
    },
    [customCategories, categoryOverrides, t],
  );

  const accountDisplayLabel = useMemo(() => {
    if (!paymentAccount) return t('addTx', 'paymentAccountNone');
    return paymentChipOptions.find((o) => o.key === paymentAccount)?.label ?? paymentAccount;
  }, [paymentAccount, paymentChipOptions, t]);

  const handleSave = async () => {
    if (editNotFound) return;
    setSaveError('');
    const numAmount = parseFloat(amount.replace(',', '.'));
    if (!numAmount || numAmount <= 0) return;
    const transferDestinationAmount = parseFloat(transferToAmount.replace(',', '.'));
    const mergedNote = mergeAccountIntoNoteLimited(note.trim(), paymentAccount, allowedPaymentKeys);
    const effectiveFromCurrency = transferFromCurrencyOverride || transferFromAccount?.currency || currency;
    const payload = type === 'transfer'
      ? {
          amount: numAmount,
          currency: effectiveFromCurrency,
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
    if (type !== 'transfer') {
      saveAddTransactionDefaults({
        type,
        currency,
        categoryId,
        paymentAccount: paymentAccount || undefined,
      });
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
    if (editNotFound) return false;
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!(parsedAmount > 0)) return false;
    if (type !== 'transfer') return true;
    if (!transferFromAccountKey || !transferToAccountKey || transferFromAccountKey === transferToAccountKey) {
      return false;
    }
    const parsedDestination = parseFloat(transferToAmount.replace(',', '.'));
    return parsedDestination > 0;
  }, [amount, type, transferFromAccountKey, transferToAccountKey, transferToAmount, editNotFound]);

  const validationHint = useMemo(() => {
    if (editNotFound) return t('addTx', 'editNotFound');
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!(parsedAmount > 0)) return '';
    if (type !== 'transfer') return '';
    if (!transferFromAccountKey || !transferToAccountKey) return t('addTx', 'hintTransferAccounts');
    if (transferFromAccountKey === transferToAccountKey) return t('addTx', 'hintTransferDifferent');
    const parsedDestination = parseFloat(transferToAmount.replace(',', '.'));
    if (!(parsedDestination > 0)) return t('addTx', 'hintTransferDestination');
    return '';
  }, [
    editNotFound,
    amount,
    type,
    transferFromAccountKey,
    transferToAccountKey,
    transferToAmount,
    t,
  ]);

  const amountKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValid && !editNotFound) {
      e.preventDefault();
      void handleSave();
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          onClick={handleClose}
          className={styles.closeBtn}
          aria-label={t('addTx', 'cancel')}
        >
          <X size={20} strokeWidth={2.5} />
        </button>
        <h2 className={styles.title}>{isEditing ? t('addTx', 'editTitle') : t('addTx', 'title')}</h2>
        <span className={styles.headerSpacer} aria-hidden="true" />
      </header>

      {editNotFound ? (
        <p className={styles.editNotFoundBanner} role="alert">
          {t('addTx', 'editNotFound')}
        </p>
      ) : null}

      {saveError ? (
        <p className={styles.saveError} role="alert">
          {saveError}
        </p>
      ) : null}

      <div className={styles.typeSelector}>
        <button
          type="button"
          className={`${styles.typeBtn} ${type === 'expense' ? styles.active : ''}`}
          onClick={() => handleTypeChange('expense')}
        >
          {t('addTx', 'expense')}
        </button>
        <button
          type="button"
          className={`${styles.typeBtn} ${type === 'income' ? styles.active : ''}`}
          onClick={() => handleTypeChange('income')}
        >
          {t('addTx', 'income')}
        </button>
        <button
          type="button"
          className={`${styles.typeBtn} ${type === 'transfer' ? styles.active : ''}`}
          onClick={() => handleTypeChange('transfer')}
        >
          {t('categories', 'transfer')}
        </button>
      </div>

      {type === 'transfer' ? (
        <>
          {/* Accounts first */}
          <div className={styles.metaList}>
            <button
              type="button"
              className={styles.metaRow}
              onClick={() => setTransferAccountSheet('from')}
            >
              <span className={styles.metaLabel}>{t('addTx', 'transferFrom')}</span>
              <span className={styles.metaValue}>
                {transferFromAccount
                  ? `${transferFromAccount.name} (${transferFromAccount.currency})`
                  : t('addTx', 'paymentAccountNone')}
                <ChevronRight size={18} strokeWidth={2} className={styles.metaChevron} />
              </span>
            </button>
            <button
              type="button"
              className={styles.metaRow}
              onClick={() => setTransferAccountSheet('to')}
            >
              <span className={styles.metaLabel}>{t('addTx', 'transferTo')}</span>
              <span className={styles.metaValue}>
                {transferToAccount
                  ? `${transferToAccount.name} (${transferToAccount.currency})`
                  : t('addTx', 'paymentAccountNone')}
                <ChevronRight size={18} strokeWidth={2} className={styles.metaChevron} />
              </span>
            </button>
          </div>

          {/* Amounts after accounts */}
          <div className={styles.transferAmounts}>
            <div className={styles.transferAmountBlock}>
              <span className={styles.transferAmountLabel}>{t('addTx', 'transferFrom')}</span>
              <div className={styles.amountRow}>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  placeholder={t('addTx', 'amountPlaceholder')}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                  className={styles.amountInput}
                  onKeyDown={amountKeyDown}
                />
                <select
                  className={styles.currencyBadgeSelect}
                  value={transferFromCurrencyOverride || transferFromAccount?.currency || currency}
                  onChange={(e) => setTransferFromCurrencyOverride(e.target.value)}
                  aria-label="Валюта переказу"
                >
                  {['UAH', 'PLN', 'USD', 'USDT', 'BTC', 'ETH'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.transferArrow} aria-hidden="true">↓</div>
            <div className={styles.transferAmountBlock}>
              <span className={styles.transferAmountLabel}>{t('addTx', 'transferTo')}</span>
              <div className={styles.amountRow}>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  placeholder={t('addTx', 'amountPlaceholder')}
                  value={transferToAmount}
                  onChange={(e) => setTransferToAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                  className={styles.amountInput}
                  onKeyDown={amountKeyDown}
                />
                <span className={styles.currencyBadge}>
                  {transferToAccount?.currency ?? transferFromAccount?.currency ?? currency}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.dateInline}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={styles.dateInlineInput}
              aria-label={t('addTx', 'date')}
            />
          </div>
        </>
      ) : (
        <>
          <div className={styles.amountRow}>
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
              onKeyDown={amountKeyDown}
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

          <div className={styles.dateInline}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={styles.dateInlineInput}
              aria-label={t('addTx', 'date')}
            />
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
              editTemplates: t('addTx', 'editTemplates'),
              cancelTemplate: t('addTx', 'cancelTemplate'),
              saveTemplate: t('addTx', 'saveTemplate'),
              deleteTemplate: (name) => t('addTx', 'deleteTemplate').replace('{name}', name),
            }}
          />

          <div className={styles.metaList}>
            <button
              type="button"
              className={styles.metaRow}
              onClick={() => setAccountSheetOpen(true)}
            >
              <span className={styles.metaLabel}>{t('addTx', 'paymentAccount')}</span>
              <span className={styles.metaValue}>
                {accountDisplayLabel}
                <ChevronRight size={18} strokeWidth={2} className={styles.metaChevron} />
              </span>
            </button>
            <button
              type="button"
              className={styles.metaRow}
              onClick={() => setCategorySheetOpen(true)}
            >
              <span className={styles.metaLabel}>{t('addTx', 'category')}</span>
              <span className={styles.metaValue}>
                {getCategoryDisplayName(categoryId)}
                <ChevronRight size={18} strokeWidth={2} className={styles.metaChevron} />
              </span>
            </button>
          </div>
        </>
      )}

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
        {!isValid && validationHint ? (
          <p className={styles.validationHint} role="status">
            {validationHint}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void handleSave()}
          className={styles.saveBtn}
          disabled={!isValid}
        >
          {isEditing ? t('addTx', 'saveChanges') : t('addTx', 'save')}
        </button>
      </div>

      <OptionPickerSheet
        open={accountSheetOpen}
        title={t('addTx', 'paymentAccount')}
        onClose={() => setAccountSheetOpen(false)}
        closeLabel={t('addTx', 'cancel')}
        selectedId={paymentAccount}
        options={[
          { id: '', label: t('addTx', 'paymentAccountNone') },
          ...paymentChipOptions.map(({ key, label }) => ({ id: key, label })),
        ]}
        onSelect={(id) => {
          setPaymentAccount(id);
          setAccountSheetOpen(false);
        }}
      />

      <OptionPickerSheet
        open={transferAccountSheet !== null}
        title={transferAccountSheet === 'to' ? t('addTx', 'transferTo') : t('addTx', 'transferFrom')}
        onClose={() => setTransferAccountSheet(null)}
        closeLabel={t('addTx', 'cancel')}
        selectedId={transferAccountSheet === 'to' ? transferToAccountKey : transferFromAccountKey}
        options={[
          { id: '', label: t('addTx', 'paymentAccountNone') },
          ...portfolioAccounts.map((account) => ({
            id: account.key,
            label: `${account.name} (${account.currency})`,
          })),
        ]}
        onSelect={(id) => {
          if (transferAccountSheet === 'to') setTransferToAccountKey(id);
          else setTransferFromAccountKey(id);
          setTransferAccountSheet(null);
        }}
      />

      <BottomSheet
        open={categorySheetOpen}
        title={t('addTx', 'category')}
        onClose={() => {
          setCategorySheetOpen(false);
          setIsCreatingCustom(false);
          setManagingCustom(null);
        }}
        closeLabel={t('addTx', 'cancel')}
      >
        <CategoryGrid
          type={type === 'income' ? 'income' : 'expense'}
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
            setManagingCustom(null);
            setCategorySheetOpen(false);
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
                  setCategorySheetOpen(false);
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
                  setCategorySheetOpen(false);
                }}
              >
                {editingCustomId ? t('addTx', 'saveChanges') : t('addTx', 'create')}
              </button>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </div>
  );
};

export default AddTransaction;
