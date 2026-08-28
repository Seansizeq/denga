import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import { usePortfolio } from '../context/PortfolioContext';
import CategoryGrid from '../components/ui/CategoryGrid';
import BottomSheet from '../components/ui/BottomSheet';
import OptionPickerSheet from '../components/ui/OptionPickerSheet';
import { AccountRowAvatar, type RowIconTone } from '../components/ui/AccountRowAvatar';
import { getCustomCategoryData, CATEGORIES } from '../constants/categories';
import { useTranslation } from '../i18n/LanguageContext';
import type { CategoryKey } from '../i18n/translations';
import type { TransactionType } from '../types';
import {
  getAccountSlugFromNote,
  mergeAccountIntoNoteLimited,
  stripAccountFromNote,
} from '../utils/transactionAccount';
import { normalizeCurrency, SUPPORTED_CURRENCIES, type CurrencyCode } from '../utils/currency';
import {
  normalizeDenomination,
  roundForDenomination,
  denominationPrecision,
  type Denomination,
} from '../utils/denomination';
import { useDenominationRates } from '../hooks/useDenominationRates';
import { useCategoryCatalog } from '../hooks/useCategoryCatalog';
import { useExpenseTemplates, type ExpenseTemplate } from '../hooks/useExpenseTemplates';
import { usePaymentAccountOptions } from '../hooks/usePaymentAccountOptions';
import { hapticResult } from '../utils/notify';
import { useGoBack } from '../hooks/useGoBack';
import {
  hasPrefillParams,
  loadAddTransactionDefaults,
  saveAddTransactionDefaults,
} from '../utils/addTransactionDefaults';
import { resolveCategoryForTypeChange } from '../utils/categoryForType';
import ExpenseTemplateBar from '../components/ExpenseTemplateBar';
import {
  getAccountPickerGroup,
  inferAccountSectionFromKey,
  sortAccountPickerItems,
  type AccountPickerGroup,
  type AccountSection,
} from '../utils/accountPicker';
import styles from './AddTransaction.module.css';

const AddTransaction: React.FC = () => {
  const navigate = useNavigate();
  const goBack = useGoBack('/');
  const { transactions, addTransaction, updateTransaction, isBootstrapping } = useTransactions();
  const { t, language } = useTranslation();
  const [searchParams] = useSearchParams();
  const {
    templates,
    saveTemplate,
    deleteTemplate,
    error: templateError,
  } = useExpenseTemplates();
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
  // Names, icons, colors and order all come from Settings → Categories; this
  // screen only picks one.
  const { categories: categoryOptions, customs: customCategories } = useCategoryCatalog(
    type === 'income' ? 'income' : 'expense',
  );
  const { accounts: rawAccounts } = usePortfolio();
  const { rateBetween } = useDenominationRates();
  const portfolioAccounts = useMemo<Array<{ key: string; name: string; currency: Denomination }>>(
    () => {
      const list: Array<{ key: string; name: string; currency: Denomination }> = [];
      for (const row of rawAccounts) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const key = String(r.accountKey ?? '').trim().toLowerCase();
        if (!key) continue;
        const name = String(r.name ?? r.accountKey ?? '').trim().slice(0, 40);
        list.push({
          key,
          name: name || key,
          // The unit this account holds — may be a crypto asset, so never
          // squeeze it through normalizeCurrency.
          currency: normalizeDenomination(typeof r.primaryCurrency === 'string' ? r.primaryCurrency : undefined),
        });
      }
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      return list;
    },
    [rawAccounts],
  );

  // Icon tone / section / iconKey per account, so the picker can show avatars
  // matching the rest of the app instead of a bare text list.
  const accountMetaByKey = useMemo(() => {
    const map = new Map<string, { iconTone: RowIconTone; section: AccountSection; iconKey: string | null }>();
    for (const row of rawAccounts) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const key = String(r.accountKey ?? '').trim().toLowerCase();
      if (!key) continue;
      const sectionRaw = typeof r.section === 'string' ? r.section.trim() : '';
      const section = (['bank', 'cash', 'crypto', 'stocks', 'debt', 'goal'] as const).includes(sectionRaw as AccountSection)
        ? (sectionRaw as AccountSection)
        : 'bank';
      const toneRaw = typeof r.iconTone === 'string' ? r.iconTone.trim() : '';
      const iconTone = (['bank', 'cash', 'crypto', 'stocks', 'debt', 'goal', 'neutral'] as const).includes(toneRaw as RowIconTone)
        ? (toneRaw as RowIconTone)
        : section;
      const iconKey = typeof r.iconKey === 'string' && r.iconKey.trim() ? r.iconKey.trim() : null;
      map.set(key, { iconTone, section, iconKey });
    }
    return map;
  }, [rawAccounts]);

  const renderAccountAvatar = useCallback(
    (key: string) => {
      if (!key) return undefined;
      const meta = accountMetaByKey.get(key);
      const section: AccountSection = meta?.section ?? inferAccountSectionFromKey(key);
      const tone: RowIconTone = meta?.iconTone ?? section;
      return (
        <AccountRowAvatar
          accountKey={key}
          iconTone={tone}
          section={section}
          iconKey={meta?.iconKey ?? null}
          glyphSize={19}
        />
      );
    },
    [accountMetaByKey],
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
  // True once the user edits the destination amount by hand, so a suggested
  // rate never overwrites the figure they actually received.
  const [transferToAmountTouched, setTransferToAmountTouched] = useState(
    () => Boolean(editingTransaction?.type === 'transfer' && editingTransaction?.transferToAmount),
  );

  const { allowedPaymentKeys, paymentChipOptions } = usePaymentAccountOptions(
    portfolioAccounts,
    language,
    paymentAccount,
  );

  // Ті самі заголовки, що й у гаманці, щоб розділи збігалися.
  const accountGroupLabels = useMemo<Record<AccountPickerGroup, string>>(() => ({
    bank: t('balance', 'sectionBank'),
    cash: t('balance', 'sectionCash'),
    crypto: t('balance', 'sectionCrypto'),
    debt: t('balance', 'sectionDebt'),
  }), [t]);

  const paymentAccountPickerItems = useMemo(
    () => sortAccountPickerItems(
      paymentChipOptions.map(({ key, label }) => ({
        key,
        label,
        section: accountMetaByKey.get(key)?.section ?? inferAccountSectionFromKey(key),
      })),
      language,
    ),
    [paymentChipOptions, accountMetaByKey, language],
  );

  const transferAccountPickerItems = useMemo(
    () => sortAccountPickerItems(
      portfolioAccounts.map((account) => ({
        ...account,
        label: account.name,
        section: accountMetaByKey.get(account.key)?.section ?? inferAccountSectionFromKey(account.key),
      })),
      language,
    ),
    [portfolioAccounts, accountMetaByKey, language],
  );

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
  // A transfer is always denominated by its accounts: you move what the source
  // account holds, and it lands as what the destination account holds.
  const transferFromDenomination: Denomination = transferFromAccount?.currency ?? normalizeDenomination(currency);
  const transferToDenomination: Denomination =
    transferToAccount?.currency ?? transferFromAccount?.currency ?? normalizeDenomination(currency);
  const transferUsesExchange = transferFromDenomination !== transferToDenomination;

  const transferSuggestedRate = useMemo(
    () => (transferUsesExchange ? rateBetween(transferFromDenomination, transferToDenomination) : null),
    [transferUsesExchange, rateBetween, transferFromDenomination, transferToDenomination],
  );

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
    // An existing transfer already carries the figure that actually landed.
    setTransferToAmountTouched(Boolean(tx.type === 'transfer' && tx.transferToAmount));
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

  // Same denomination on both sides: the amount that leaves is the amount that
  // arrives, so the destination field mirrors the source and stays read-only.
  useEffect(() => {
    if (type !== 'transfer' || transferUsesExchange) return;
    setTransferToAmount(amount || '');
    setTransferToAmountTouched(false);
  }, [type, transferUsesExchange, amount]);

  // Different denominations: suggest the destination amount from the current
  // rate, but only until the user types their own figure.
  useEffect(() => {
    if (type !== 'transfer' || !transferUsesExchange || transferToAmountTouched) return;
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!(parsedAmount > 0) || transferSuggestedRate === null) {
      setTransferToAmount('');
      return;
    }
    setTransferToAmount(
      String(roundForDenomination(parsedAmount * transferSuggestedRate, transferToDenomination)),
    );
  }, [
    type,
    transferUsesExchange,
    transferToAmountTouched,
    amount,
    transferSuggestedRate,
    transferToDenomination,
  ]);

  const handleTypeChange = useCallback(
    (newType: TransactionType) => {
      setType(newType);
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
      const fromCatalog = categoryOptions.find((c) => c.id === id);
      if (fromCatalog) return fromCatalog.name;
      // A transfer, or a category of the other type: not in this catalog.
      const customData = getCustomCategoryData(id);
      if (customData) return customData.name;
      const builtIn = CATEGORIES.find((c) => c.id === id);
      if (builtIn) return t('categories', id as CategoryKey);
      return id;
    },
    [categoryOptions, t],
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
    const payload = type === 'transfer'
      ? {
          amount: numAmount,
          // Both sides are dictated by the accounts, never by a free-standing
          // currency picker that the server would only reject.
          currency: transferFromDenomination,
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
          transferToCurrency: transferToDenomination,
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
      hapticResult('error');
      setSaveError(t('addTx', 'saveFailed'));
      return;
    }
    hapticResult('success');
    if (type !== 'transfer') {
      saveAddTransactionDefaults({
        type,
        currency,
        categoryId,
        paymentAccount: paymentAccount || undefined,
      });
    }
    // Редагування повертає на екран, з якого його відкрили (частіше за все —
    // історія). Створення нової операції веде на головну, бо звідти її
    // зазвичай і починають.
    if (isEditing) goBack();
    else navigate('/');
  };

  const handleApplyTemplate = useCallback((tpl: ExpenseTemplate) => {
    if (tpl.amount != null && tpl.amount > 0) setAmount(String(tpl.amount));
    setCurrency(tpl.currency);
    setCategoryId(tpl.categoryId);
    if (tpl.note !== undefined) setNote(tpl.note);
    if (tpl.account !== undefined) setPaymentAccount(tpl.account);
  }, []);

  const handleSaveTemplate = useCallback((name: string) => {
    // The bar is only rendered outside the transfer branch, so this is a
    // belt-and-braces guard that also narrows the type for the payload.
    if (type === 'transfer') return;
    const numAmount = parseFloat(amount.replace(',', '.'));
    void saveTemplate({
      name,
      type,
      amount: Number.isFinite(numAmount) && numAmount > 0 ? numAmount : undefined,
      currency,
      categoryId,
      note: note.trim() || undefined,
      account: paymentAccount || undefined,
    });
  }, [amount, type, currency, categoryId, note, paymentAccount, saveTemplate]);

  const handleDeleteTemplate = useCallback((id: string) => {
    void deleteTemplate(id);
  }, [deleteTemplate]);

  const templateErrorText = useMemo(() => {
    if (templateError === 'limit') return t('addTx', 'templateLimitReached');
    if (templateError === 'save' || templateError === 'delete') return t('addTx', 'templateSyncFailed');
    return '';
  }, [templateError, t]);

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
      {/* Власного хрестика тут немає навмисно: він робив рівно те саме, що
          системна кнопка «назад» Telegram, яку вмикає TelegramBackButton, і
          в повноекранному режимі налазив на плаваючі кнопки самого Telegram. */}
      <header className={styles.header}>
        <h2 className={styles.title}>{isEditing ? t('addTx', 'editTitle') : t('addTx', 'title')}</h2>
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
                <span className={styles.currencyBadge}>{transferFromDenomination}</span>
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
                  onChange={(e) => {
                    setTransferToAmountTouched(true);
                    setTransferToAmount(e.target.value.replace(/[^0-9.,]/g, ''));
                  }}
                  className={styles.amountInput}
                  onKeyDown={amountKeyDown}
                  // Same unit on both sides: what leaves is what arrives, so
                  // there is nothing to type here.
                  readOnly={!transferUsesExchange}
                  aria-readonly={!transferUsesExchange}
                />
                <span className={styles.currencyBadge}>{transferToDenomination}</span>
              </div>
            </div>
          </div>

          {transferUsesExchange ? (
            <p className={styles.transferRateHint}>
              {transferSuggestedRate === null
                ? t('addTx', 'transferRateUnavailable')
                : `1 ${transferFromDenomination} ≈ ${transferSuggestedRate.toLocaleString(undefined, {
                    maximumFractionDigits: denominationPrecision(transferToDenomination),
                  })} ${transferToDenomination} · ${t('addTx', 'transferRateEditable')}`}
            </p>
          ) : null}

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
            onDelete={handleDeleteTemplate}
            onSave={handleSaveTemplate}
            errorText={templateErrorText}
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
          ...paymentAccountPickerItems.map(({ key, label, section }) => {
            const acc = portfolioAccounts.find((a) => a.key === key);
            return {
              id: key,
              label,
              leading: renderAccountAvatar(key),
              hint: acc && acc.currency !== 'UAH' ? acc.currency : undefined,
              group: accountGroupLabels[getAccountPickerGroup(section)],
            };
          }),
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
          ...transferAccountPickerItems.map((account) => ({
            id: account.key,
            label: account.name,
            hint: account.currency,
            leading: renderAccountAvatar(account.key),
            group: accountGroupLabels[getAccountPickerGroup(account.section)],
          })),
        ]}
        onSelect={(id) => {
          if (transferAccountSheet === 'to') setTransferToAccountKey(id);
          else setTransferFromAccountKey(id);
          // Picking a different account changes what the destination figure
          // means, so hand control back to the suggested rate.
          setTransferToAmountTouched(false);
          setTransferAccountSheet(null);
        }}
      />

      <BottomSheet
        open={categorySheetOpen}
        title={t('addTx', 'category')}
        onClose={() => setCategorySheetOpen(false)}
        closeLabel={t('addTx', 'cancel')}
      >
        <CategoryGrid
          categories={categoryOptions}
          selectedId={categoryId}
          onSelect={(id) => {
            setCategoryId(id);
            setCategorySheetOpen(false);
          }}
        />
      </BottomSheet>
    </div>
  );
};

export default AddTransaction;
