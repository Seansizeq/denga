import React, { useCallback, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import Header from '../components/ui/Header';
import AccountsSnapshot from '../components/ui/AccountsSnapshot';
import AccountEditSheet, { type EditableAccount } from '../components/ui/AccountEditSheet';
import DebtDetailSheet from '../components/ui/DebtDetailSheet';
import SectionPickerSheet, { type PickableSection } from '../components/ui/SectionPickerSheet';
import AssetRing from '../components/ui/AssetRing';
import { usePortfolio } from '../context/PortfolioContext';
import { useTransactions } from '../context/TransactionContext';
import { useTranslation } from '../i18n/LanguageContext';
import { apiFetch } from '../api/client';
import { sanitizeAccountBadge } from '../utils/accountIcons';
import { parseCryptoPosition } from '../utils/cryptoPosition';
import styles from './Accounts.module.css';

type PortfolioSection = 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt';
type IconTone = 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt' | 'neutral';
type DebtDirection = 'owed_to_me' | 'owed_by_me';

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
  debtDirection: DebtDirection | null;
};

const isPortfolioSection = (v: string): v is PortfolioSection => ['bank', 'cash', 'crypto', 'stocks', 'debt'].includes(v);

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
  const debtDirectionRaw = typeof r.debtDirection === 'string' ? r.debtDirection : '';
  const debtDirection: DebtDirection | null =
    section === 'debt' ? (debtDirectionRaw === 'owed_by_me' ? 'owed_by_me' : 'owed_to_me') : null;
  const badge = typeof r.badge === 'string' ? r.badge : null;
  const iconKey = typeof r.iconKey === 'string' && r.iconKey.trim() ? r.iconKey.trim() : null;
  const iconRaw = typeof r.iconTone === 'string' ? r.iconTone.trim() : 'neutral';
  const iconTone: IconTone = ['bank', 'cash', 'crypto', 'stocks', 'debt', 'neutral'].includes(iconRaw)
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
    debtDirection,
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
  debtDirection: r.debtDirection ?? 'owed_to_me',
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
    debtDirection: section === 'debt' ? 'owed_to_me' : null,
  };
};


const SECTION_COLORS: Record<string, string> = {
  bank: '#FF9F0A',
  cash: '#7C5CFF',
  crypto: '#4CA8FF',
  stocks: '#34C759',
  'debt-owed-to-me': '#E84848',
  'debt-owed-by-me': '#8E8E93',
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
  const { transactions } = useTransactions();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<EditableAccount | null>(null);
  const [debtDetail, setDebtDetail] = useState<PortfolioAccountRow | null>(null);

  const portfolio = useMemo<readonly PortfolioAccountRow[]>(
    () => accounts.map(parsePortfolioRow).filter((r): r is PortfolioAccountRow => Boolean(r)),
    [accounts],
  );

  const handlePickSection = useCallback(
    (section: PickableSection) => setEditing(createEmptyAccount(section, portfolio)),
    [portfolio],
  );

  const cryptoUsdPrices = cryptoPrices;

  const sections = useMemo(() => {
    type Row = {
      id: string;
      name: string;
      amount: string;
      badge: string;
      subAmount?: string;
      iconTone: 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt' | 'neutral';
      section: PortfolioSection;
      iconKey: string | null;
      cryptoSymbol: string | null;
    };

    const rowsFor = (key: PortfolioSection, direction?: DebtDirection) =>
      portfolio
        .filter((r) => r.section === key && (!direction || r.debtDirection === direction))
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
          const amount = fiat;
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

    const sumSectionFiat = (key: PortfolioSection, direction?: DebtDirection) => {
      const list = portfolio.filter((r) => r.section === key && (!direction || r.debtDirection === direction));
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
        id: 'stocks',
        title: 'Акції',
        total: sumSectionFiat('stocks'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: rowsFor('stocks'),
      },
      {
        id: 'debt-owed-to-me',
        title: t('balance', 'sectionDebtOwedToMe'),
        total: sumSectionFiat('debt', 'owed_to_me'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: rowsFor('debt', 'owed_to_me'),
      },
      {
        id: 'debt-owed-by-me',
        title: t('balance', 'sectionDebtOwedByMe'),
        total: sumSectionFiat('debt', 'owed_by_me'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: rowsFor('debt', 'owed_by_me'),
      },
    ];
  }, [portfolio, t, convertAmount, displayCurrency, cryptoUsdPrices]);

  const ringSegments = useMemo(() => {
    const sumNumeric = (key: PortfolioSection, direction?: DebtDirection): number =>
      portfolio
        .filter((r) => r.section === key && (!direction || r.debtDirection === direction))
        .reduce((a, r) => {
          const position = r.section === 'crypto' ? parseCryptoPosition(r.subText) : null;
          const marketUsd = position ? (cryptoUsdPrices[position.symbol] ?? 0) * position.amount : 0;
          const dynamicPrimary =
            position && marketUsd > 0
              ? convertAmount(marketUsd, 'USD', r.primaryCurrency)
              : r.primaryAmount;
          return a + convertAmount(dynamicPrimary, r.primaryCurrency, displayCurrency);
        }, 0);

    // Debts owed to me are a receivable asset and count toward the ring; debts I owe are
    // a liability and never contribute a slice (see the liability line rendered under the ring).
    const assetSections = sections.filter((s) => s.id !== 'debt-owed-by-me');

    return assetSections
      .map((s) => ({
        id: s.id,
        label: s.title,
        amount: s.id === 'debt-owed-to-me' ? sumNumeric('debt', 'owed_to_me') : sumNumeric(s.id as PortfolioSection),
        color: SECTION_COLORS[s.id] ?? '#8E8E93',
      }))
      .filter((s) => s.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [portfolio, sections, convertAmount, displayCurrency, cryptoUsdPrices]);

  const owedByMeTotal = useMemo(() => {
    return portfolio
      .filter((r) => r.section === 'debt' && r.debtDirection === 'owed_by_me')
      .reduce((a, r) => a + convertAmount(r.primaryAmount, r.primaryCurrency, displayCurrency), 0);
  }, [portfolio, convertAmount, displayCurrency]);

  const debtRepayments = useMemo(() => {
    if (!debtDetail) return [];
    return transactions
      .filter((tx) => tx.categoryId === 'debt_return' && tx.fromAccountKey === debtDetail.accountKey)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 10);
  }, [transactions, debtDetail]);

  const handleRowPress = useCallback(
    (id: string) => {
      const row = portfolio.find((r) => r.accountKey === id);
      if (!row) return;
      if (row.section === 'debt') {
        setDebtDetail(row);
      } else {
        setEditing(mapPortfolioToEditable(row));
      }
    },
    [portfolio],
  );

  const handleDebtPayment = useCallback(
    async (accountKey: string, amount: number, note: string) => {
      const res = await apiFetch(`/api/accounts/${encodeURIComponent(accountKey)}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, note }),
      });
      if (!res.ok) throw new Error('payment failed');
      await refreshAccounts();
    },
    [refreshAccounts],
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
          debtDirection: next.section === 'debt' ? next.debtDirection : null,
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

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <Header />
        <button
          type="button"
          className={styles.addButton}
          onClick={() => setPicking(true)}
          aria-label="Додати рахунок"
        >
          <Plus size={18} strokeWidth={2.6} />
          <span>Додати рахунок</span>
        </button>
        {portfolio.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Рахунків ще немає</p>
            <p className={styles.emptyHint}>Натисніть + щоб додати перший рахунок</p>
          </div>
        ) : (
          <>
            {ringSegments.length > 0 && (
              <AssetRing segments={ringSegments} />
            )}
            {owedByMeTotal > 0 && (
              <p className={styles.liabilityLine}>
                {t('balance', 'liabilityLineLabel')}: {formatGroupAmount(owedByMeTotal, displayCurrency)}
              </p>
            )}
            <AccountsSnapshot sections={sections.filter((s) => s.rows.length > 0)} onRowPress={handleRowPress} />
          </>
        )}
        <div className={styles.spacer} />
      </div>
      <SectionPickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        onSelect={handlePickSection}
      />
      {debtDetail ? (
        <DebtDetailSheet
          account={debtDetail}
          repayments={debtRepayments}
          onClose={() => setDebtDetail(null)}
          onPayment={handleDebtPayment}
          onEdit={() => {
            setEditing(mapPortfolioToEditable(debtDetail));
            setDebtDetail(null);
          }}
        />
      ) : null}
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
