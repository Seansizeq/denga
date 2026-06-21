import React, { useCallback, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import Header from '../components/ui/Header';
import AccountsSnapshot from '../components/ui/AccountsSnapshot';
import AccountEditSheet, { type EditableAccount } from '../components/ui/AccountEditSheet';
import { usePortfolio } from '../context/PortfolioContext';
import { useTranslation } from '../i18n/LanguageContext';
import { apiFetch } from '../api/client';
import { sanitizeAccountBadge } from '../utils/accountIcons';
import { parseCryptoPosition } from '../utils/cryptoPosition';
import styles from './Accounts.module.css';

type PortfolioSection = 'bank' | 'cash' | 'crypto' | 'debt';
type IconTone = 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral';

type PortfolioAccountRow = {
  accountKey: string;
  section: PortfolioSection;
  sortIndex: number;
  name: string;
  primaryAmount: number;
  primaryCurrency: 'UAH' | 'PLN';
  subText: string | null;
  iconTone: IconTone;
  badge: string | null;
  iconKey: string | null;
  debtPhrase: string | null;
};

const isPortfolioSection = (v: string): v is PortfolioSection => ['bank', 'cash', 'crypto', 'debt'].includes(v);

const parsePortfolioRow = (raw: unknown): PortfolioAccountRow | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const accountKey = typeof r.accountKey === 'string' ? r.accountKey.trim() : '';
  const section = typeof r.section === 'string' ? r.section.trim() : '';
  if (!accountKey || !isPortfolioSection(section)) return null;
  const name = typeof r.name === 'string' ? r.name : '';
  const primaryAmount = Number(r.primaryAmount);
  const sortIndex = Number(r.sortIndex);
  if (!Number.isFinite(primaryAmount) || !Number.isFinite(sortIndex)) return null;
  const primaryCurrency = r.primaryCurrency === 'PLN' ? 'PLN' : 'UAH';
  const subText = typeof r.subText === 'string' ? r.subText : null;
  const debtPhrase = typeof r.debtPhrase === 'string' ? r.debtPhrase : null;
  const badge = typeof r.badge === 'string' ? r.badge : null;
  const iconKey = typeof r.iconKey === 'string' && r.iconKey.trim() ? r.iconKey.trim() : null;
  const iconRaw = typeof r.iconTone === 'string' ? r.iconTone.trim() : 'neutral';
  const iconTone: IconTone = ['bank', 'cash', 'crypto', 'debt', 'neutral'].includes(iconRaw)
    ? (iconRaw as IconTone)
    : 'neutral';
  return {
    accountKey,
    section,
    sortIndex,
    name,
    primaryAmount,
    primaryCurrency,
    subText,
    iconTone,
    badge,
    iconKey,
    debtPhrase,
  };
};

const mapPortfolioToEditable = (r: PortfolioAccountRow): EditableAccount => ({
  accountKey: r.accountKey,
  section: r.section,
  sortIndex: r.sortIndex,
  name: r.name,
  primaryAmount: r.primaryAmount,
  primaryCurrency: r.primaryCurrency,
  subText: r.subText ?? '',
  iconTone: r.iconTone,
  badge: r.badge ?? '',
  iconKey: r.iconKey ?? '',
  debtPhrase: r.debtPhrase ?? '',
});

const createEmptyAccount = (section: PortfolioSection, existing: readonly PortfolioAccountRow[]): EditableAccount => {
  const maxSort = existing
    .filter((r) => r.section === section)
    .reduce((max, r) => Math.max(max, r.sortIndex), 0);
  return {
    accountKey: '',
    section,
    sortIndex: maxSort + 10,
    name: '',
    primaryAmount: 0,
    primaryCurrency: 'UAH',
    subText: '',
    iconTone: section,
    badge: '',
    iconKey: '',
    debtPhrase: section === 'debt' ? 'мені винні' : '',
  };
};

const ACCOUNT_TEMPLATES: Array<{
  label: string;
  section: PortfolioSection;
  iconTone: IconTone;
  badge: string;
  iconKey: string;
  primaryCurrency: 'UAH' | 'PLN';
}> = [
  { label: 'Monobank', section: 'bank', iconTone: 'bank', badge: 'MB', iconKey: 'CreditCard', primaryCurrency: 'UAH' },
  { label: 'PrivatBank', section: 'bank', iconTone: 'bank', badge: 'PB', iconKey: 'Landmark', primaryCurrency: 'UAH' },
  { label: 'Готівка', section: 'cash', iconTone: 'cash', badge: 'KSH', iconKey: 'Wallet', primaryCurrency: 'UAH' },
  { label: 'Готівка PLN', section: 'cash', iconTone: 'cash', badge: 'PLN', iconKey: 'Banknote', primaryCurrency: 'PLN' },
  { label: 'USDT', section: 'crypto', iconTone: 'crypto', badge: 'USDT', iconKey: 'CircleDollarSign', primaryCurrency: 'UAH' },
  { label: 'Bitcoin', section: 'crypto', iconTone: 'crypto', badge: 'BTC', iconKey: 'Coins', primaryCurrency: 'UAH' },
];

const createFromTemplate = (
  tmpl: (typeof ACCOUNT_TEMPLATES)[number],
  existing: readonly PortfolioAccountRow[],
): EditableAccount => {
  const maxSort = existing
    .filter((r) => r.section === tmpl.section)
    .reduce((max, r) => Math.max(max, r.sortIndex), 0);
  return {
    accountKey: '',
    section: tmpl.section,
    sortIndex: maxSort + 10,
    name: tmpl.label,
    primaryAmount: 0,
    primaryCurrency: tmpl.primaryCurrency,
    subText: '',
    iconTone: tmpl.iconTone,
    badge: tmpl.badge,
    iconKey: tmpl.iconKey,
    debtPhrase: '',
  };
};

const formatGroupAmount = (amount: number, currency: string) => {
  const normalized = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(normalized).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const sign = normalized < 0 ? '−' : '';
  const suffix = currency === 'PLN' ? 'zł' : currency;
  return `${sign}${abs} ${suffix}`;
};

const Accounts: React.FC = () => {
  const { t, displayCurrency, convertAmount } = useTranslation();
  const { accounts, cryptoPrices, refreshAccounts } = usePortfolio();
  const [editing, setEditing] = useState<EditableAccount | null>(null);

  const portfolio = useMemo<readonly PortfolioAccountRow[]>(
    () => accounts.map(parsePortfolioRow).filter((r): r is PortfolioAccountRow => Boolean(r)),
    [accounts],
  );

  const cryptoUsdPrices = cryptoPrices;

  const sections = useMemo(() => {
    type Row = {
      id: string;
      name: string;
      amount: string;
      badge: string;
      subAmount?: string;
      iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral';
      section: PortfolioSection;
      iconKey: string | null;
      cryptoSymbol: string | null;
    };

    const rowsFor = (key: PortfolioSection) =>
      portfolio
        .filter((r) => r.section === key)
        .slice()
        .sort((a, b) => a.sortIndex - b.sortIndex || a.accountKey.localeCompare(b.accountKey))
        .map((r) => {
          const position = r.section === 'crypto' ? parseCryptoPosition(r.subText) : null;
          const marketUsd = position ? (cryptoUsdPrices[position.symbol] ?? 0) * position.amount : 0;
          const dynamicPrimary =
            position && marketUsd > 0
              ? convertAmount(marketUsd, 'USD', r.primaryCurrency)
              : r.primaryAmount;
          const fiat = formatGroupAmount(dynamicPrimary, r.primaryCurrency);
          const amount = r.debtPhrase?.trim() ? `${r.debtPhrase.trim()} ${fiat}` : fiat;
          const converted = convertAmount(dynamicPrimary, r.primaryCurrency, displayCurrency);
          const fxSub = r.primaryCurrency === displayCurrency ? '' : formatGroupAmount(converted, displayCurrency);
          const subAmount = [r.subText?.trim() ?? '', fxSub].filter(Boolean).join(' · ') || undefined;
          const badge =
            r.section === 'crypto' && position
              ? position.symbol
              : sanitizeAccountBadge(r.badge ?? '', r.name);
          return {
            id: r.accountKey,
            name: r.name,
            amount,
            badge,
            subAmount,
            iconTone: r.iconTone,
            section: r.section,
            iconKey: r.iconKey,
            cryptoSymbol: position?.symbol ?? null,
          } satisfies Row;
        });

    const sumSectionFiat = (key: PortfolioSection) => {
      const list = portfolio.filter((r) => r.section === key);
      if (!list.length) return formatGroupAmount(0, displayCurrency);
      const sumDisplay = list.reduce((a, r) => {
        const position = r.section === 'crypto' ? parseCryptoPosition(r.subText) : null;
        const marketUsd = position ? (cryptoUsdPrices[position.symbol] ?? 0) * position.amount : 0;
        const dynamicPrimary =
          position && marketUsd > 0
            ? convertAmount(marketUsd, 'USD', r.primaryCurrency)
            : r.primaryAmount;
        return a + convertAmount(dynamicPrimary, r.primaryCurrency, displayCurrency);
      }, 0);
      return formatGroupAmount(sumDisplay, displayCurrency);
    };

    return [
      {
        id: 'bank',
        title: t('balance', 'sectionBank'),
        total: sumSectionFiat('bank'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: rowsFor('bank'),
      },
      {
        id: 'cash',
        title: t('balance', 'sectionCash'),
        total: sumSectionFiat('cash'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: rowsFor('cash'),
      },
      {
        id: 'crypto',
        title: t('balance', 'sectionCrypto'),
        total: sumSectionFiat('crypto'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: rowsFor('crypto'),
      },
      {
        id: 'debt',
        title: t('balance', 'sectionDebt'),
        total: sumSectionFiat('debt'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: rowsFor('debt'),
      },
    ];
  }, [portfolio, t, convertAmount, displayCurrency, cryptoUsdPrices]);

  const handleRowPress = useCallback(
    (id: string) => {
      const row = portfolio.find((r) => r.accountKey === id);
      if (!row) return;
      setEditing(mapPortfolioToEditable(row));
    },
    [portfolio],
  );

  const handleSaveAccount = useCallback(
    async (next: EditableAccount) => {
      const isCreate = !next.accountKey.trim();
      const url = isCreate
        ? '/api/accounts'
        : `/api/accounts/${encodeURIComponent(next.accountKey)}`;
      const method = isCreate ? 'POST' : 'PUT';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: next.name,
          section: next.section,
          sortIndex: next.sortIndex,
          primaryAmount: next.primaryAmount,
          primaryCurrency: next.primaryCurrency,
          subText: next.subText,
          iconTone: next.iconTone,
          badge: next.badge,
          iconKey: (next.iconKey ?? '').trim() || null,
          debtPhrase: next.debtPhrase,
        }),
      });
      if (!res.ok) {
        throw new Error('save failed');
      }
      await refreshAccounts();
    },
    [refreshAccounts],
  );

  const handleDeleteAccount = useCallback(
    async (accountKey: string) => {
      const key = accountKey.trim();
      if (!key) return;
      const res = await apiFetch(`/api/accounts/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('delete failed');
      }
      await refreshAccounts();
    },
    [refreshAccounts],
  );

  const isEmpty = portfolio.length === 0;

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <Header />
        <button
          type="button"
          className={styles.addButton}
          onClick={() => setEditing(createEmptyAccount('bank', portfolio))}
          aria-label="Додати акаунт"
        >
          <Plus size={18} strokeWidth={2.6} />
          <span>Додати рахунок</span>
        </button>
        {isEmpty ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Рахунків ще немає</p>
            <p className={styles.emptyHint}>Натисніть + або оберіть шаблон</p>
            <div className={styles.templateGrid}>
              {ACCOUNT_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.label}
                  type="button"
                  className={styles.templateBtn}
                  onClick={() => setEditing(createFromTemplate(tmpl, portfolio))}
                >
                  {tmpl.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <AccountsSnapshot sections={sections} onRowPress={handleRowPress} />
        )}
        <div className={styles.spacer} />
      </div>
      {editing ? (
        <AccountEditSheet
          key={editing.accountKey}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={handleSaveAccount}
          onDelete={handleDeleteAccount}
        />
      ) : null}
    </div>
  );
};

export default Accounts;
