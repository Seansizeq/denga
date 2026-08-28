import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import AccountsSnapshot from '../components/ui/AccountsSnapshot';
import AccountEditSheet, { type EditableAccount } from '../components/ui/AccountEditSheet';
import DebtDetailSheet from '../components/ui/DebtDetailSheet';
import SectionPickerSheet, { type PickableSection } from '../components/ui/SectionPickerSheet';
import AssetRing from '../components/ui/AssetRing';
import RowSkeleton from '../components/ui/RowSkeleton';
import { usePortfolio } from '../context/PortfolioContext';
import { useTransactions } from '../context/TransactionContext';
import { useTranslation } from '../i18n/LanguageContext';
import { apiFetch } from '../api/client';
import { sanitizeAccountBadge } from '../utils/accountIcons';
import {
  isCryptoDenomination,
  normalizeDenomination,
  type Denomination,
} from '../utils/denomination';
import { useDenominationRates } from '../hooks/useDenominationRates';
import { formatCurrency } from '../utils/formatters';
import { isMoneyHidden } from '../utils/moneyPrivacy';
import styles from './Accounts.module.css';

type PortfolioSection = 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt' | 'goal';
type IconTone = 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt' | 'goal' | 'neutral';
/** Секції, які користувач створює й редагує сам. Рахунок цілі веде сама ціль. */
type EditableSection = Exclude<PortfolioSection, 'goal'>;
type DebtDirection = 'owed_to_me' | 'owed_by_me';

type PortfolioAccountRow = {
  accountKey: string;
  section: PortfolioSection;
  sortIndex: number;
  name: string;
  primaryAmount: number;
  /** The unit the balance is counted in — fiat currency or crypto asset. */
  primaryCurrency: Denomination;
  subText: string | null;
  iconTone: IconTone;
  badge: string | null;
  iconKey: string | null;
  debtDirection: DebtDirection | null;
  debtInitialAmount: number | null;
  debtCreatedAt: string | null;
};

const isPortfolioSection = (v: string): v is PortfolioSection =>
  ['bank', 'cash', 'crypto', 'stocks', 'debt', 'goal'].includes(v);

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
  const primaryCurrency = normalizeDenomination(
    typeof r.primaryCurrency === 'string' ? r.primaryCurrency : undefined,
  );
  const subText = typeof r.subText === 'string' ? r.subText : null;
  const debtDirectionRaw = typeof r.debtDirection === 'string' ? r.debtDirection : '';
  const debtDirection: DebtDirection | null =
    section === 'debt' ? (debtDirectionRaw === 'owed_by_me' ? 'owed_by_me' : 'owed_to_me') : null;
  const badge = typeof r.badge === 'string' ? r.badge : null;
  const debtInitialRaw = Number(r.debtInitialAmount);
  const debtInitialAmount = section === 'debt' && Number.isFinite(debtInitialRaw) ? debtInitialRaw : null;
  const debtCreatedAt = section === 'debt' && typeof r.debtCreatedAt === 'string' ? r.debtCreatedAt : null;
  const iconKey = typeof r.iconKey === 'string' && r.iconKey.trim() ? r.iconKey.trim() : null;
  const iconRaw = typeof r.iconTone === 'string' ? r.iconTone.trim() : 'neutral';
  const iconTone: IconTone = ['bank', 'cash', 'crypto', 'stocks', 'debt', 'goal', 'neutral'].includes(iconRaw)
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
    debtInitialAmount,
    debtCreatedAt,
  };
};

/**
 * Рахунок цілі редагується через саму ціль, тож у форму рахунку він не потрапляє:
 * сервер такі правки все одно відхиляє (`GOAL_ACCOUNT_READONLY`).
 */
const mapPortfolioToEditable = (r: PortfolioAccountRow): EditableAccount | null => {
  if (r.section === 'goal') return null;
  return {
  accountKey: r.accountKey,
  section: r.section,
  sortIndex: r.sortIndex,
  name: r.name,
  primaryAmount: r.primaryAmount,
  primaryCurrency: r.primaryCurrency,
  subText: r.subText ?? '',
  iconTone: r.iconTone === 'goal' ? 'neutral' : r.iconTone,
  badge: r.badge ?? '',
  iconKey: r.iconKey ?? '',
  debtDirection: r.debtDirection ?? 'owed_to_me',
  };
};

const createEmptyAccount = (section: EditableSection, existing: readonly PortfolioAccountRow[]): EditableAccount => {
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
  goal: '#F7E34D',
};

/**
 * Гроші тут виглядають так само, як на решті екранів: та сама функція, той
 * самий символ валюти, локаль користувача. Раніше цей екран мав власний
 * формат (`5 983,8 UAH` під кільцем із `5 983,8 ₴`).
 */
const formatGroupAmount = (amount: number, currency: string, locale: string) => {
  const normalized = Number.isFinite(amount) ? amount : 0;
  // У прихованому режимі мінус теж мовчить — інакше видно, що група в боргах.
  const sign = !isMoneyHidden() && normalized < 0 ? '−' : '';
  return `${sign}${formatCurrency(Math.abs(normalized), locale, normalizeDenomination(currency))}`;
};

const Accounts: React.FC = () => {
  const navigate = useNavigate();
  const { t, locale, displayCurrency } = useTranslation();
  const { convert } = useDenominationRates();
  const { accounts, accountsLoaded, refreshAccounts } = usePortfolio();
  const { transactions, refreshTransactions } = useTransactions();
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

  const sections = useMemo(() => {
    type Row = {
      id: string;
      name: string;
      amount: string;
      badge: string;
      subAmount?: string;
      iconTone: 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt' | 'goal' | 'neutral';
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
          // The balance is already counted in the unit the account holds, so
          // there is nothing to parse or re-derive here.
          const amount = formatGroupAmount(r.primaryAmount, r.primaryCurrency, locale);
          const converted = convert(r.primaryAmount, r.primaryCurrency, displayCurrency);
          const fxSub =
            r.primaryCurrency === displayCurrency
              ? ''
              : converted === null
                // A missing crypto price shows as a dash rather than a wrong figure.
                ? '—'
                : formatGroupAmount(converted, displayCurrency, locale);
          const subAmount = [r.subText?.trim() ?? '', fxSub].filter(Boolean).join(' · ') || undefined;
          const badge = isCryptoDenomination(r.primaryCurrency)
            ? r.primaryCurrency
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
            cryptoSymbol: isCryptoDenomination(r.primaryCurrency) ? r.primaryCurrency : null,
          } satisfies Row;
        });

    const sumSectionFiat = (key: PortfolioSection, direction?: DebtDirection) => {
      const list = portfolio.filter((r) => r.section === key && (!direction || r.debtDirection === direction));
      if (!list.length) return formatGroupAmount(0, displayCurrency, locale);
      let priced = 0;
      const sumDisplay = list.reduce((a, r) => {
        // Unpriced crypto contributes nothing rather than a made-up number.
        const value = convert(r.primaryAmount, r.primaryCurrency, displayCurrency);
        if (value === null) return a;
        priced += 1;
        return a + value;
      }, 0);
      // Жодної відомої ціни — підсумок «0 ₴» був би вигадкою, як і в рядку.
      if (priced === 0) return '—';
      return formatGroupAmount(sumDisplay, displayCurrency, locale);
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
        title: t('balance', 'sectionStocks'),
        total: sumSectionFiat('stocks'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: rowsFor('stocks'),
      },
      {
        id: 'goal',
        title: t('balance', 'sectionGoals'),
        total: sumSectionFiat('goal'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: rowsFor('goal'),
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
  }, [portfolio, t, convert, displayCurrency, locale]);

  const ringSegments = useMemo(() => {
    const sumNumeric = (key: PortfolioSection, direction?: DebtDirection): number =>
      portfolio
        .filter((r) => r.section === key && (!direction || r.debtDirection === direction))
        .reduce((a, r) => a + (convert(r.primaryAmount, r.primaryCurrency, displayCurrency) ?? 0), 0);

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
  }, [portfolio, sections, convert, displayCurrency]);

  const owedByMeTotal = useMemo(() => {
    return portfolio
      .filter((r) => r.section === 'debt' && r.debtDirection === 'owed_by_me')
      .reduce((a, r) => a + (convert(r.primaryAmount, r.primaryCurrency, displayCurrency) ?? 0), 0);
  }, [portfolio, convert, displayCurrency]);

  const debtRepayments = useMemo(() => {
    if (!debtDetail) return [];
    return transactions
      .filter(
        (tx) =>
          tx.categoryId === 'debt_return' &&
          (tx.fromAccountKey === debtDetail.accountKey || tx.toAccountKey === debtDetail.accountKey),
      )
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 10);
  }, [transactions, debtDetail]);

  const debtPaymentAccounts = useMemo(() => {
    if (!debtDetail) return [];
    return portfolio.filter((row) => ['bank', 'cash'].includes(row.section) && row.primaryCurrency === debtDetail.primaryCurrency);
  }, [portfolio, debtDetail]);

  const handleRowPress = useCallback(
    (id: string) => {
      const row = portfolio.find((r) => r.accountKey === id);
      if (!row) return;
      // Рахунок цілі не редагується як рахунок — ним керує сама ціль, тож тап
      // веде туди, а не в форму, яку сервер усе одно відхилив би.
      if (row.section === 'goal') {
        navigate('/goals');
        return;
      }
      if (row.section === 'debt') {
        setDebtDetail(row);
      } else {
        setEditing(mapPortfolioToEditable(row));
      }
    },
    [portfolio, navigate],
  );

  const handleDebtPayment = useCallback(
    async (accountKey: string, amount: number, note: string, paymentAccountKey: string) => {
      const res = await apiFetch(`/api/accounts/${encodeURIComponent(accountKey)}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, note, paymentAccountKey }),
      });
      if (!res.ok) throw new Error('payment failed');
      await refreshAccounts();
      await refreshTransactions();
    },
    [refreshAccounts, refreshTransactions],
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
        <button
          type="button"
          className={styles.addButton}
          onClick={() => setPicking(true)}
          aria-label={t('balance', 'accountsAdd')}
        >
          <Plus size={18} strokeWidth={2.6} />
          <span>{t('balance', 'accountsAdd')}</span>
        </button>
        {portfolio.length === 0 && !accountsLoaded ? (
          // Поки не прийшла перша відповідь, «рахунків немає» було б брехнею.
          <RowSkeleton count={4} />
        ) : portfolio.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{t('balance', 'accountsEmptyTitle')}</p>
            <p className={styles.emptyHint}>{t('balance', 'accountsEmptyHint')}</p>
          </div>
        ) : (
          <>
            {ringSegments.length > 0 && (
              <AssetRing segments={ringSegments} />
            )}
            {owedByMeTotal > 0 && (
              <p className={styles.liabilityLine}>
                {t('balance', 'liabilityLineLabel')}: {formatGroupAmount(owedByMeTotal, displayCurrency, locale)}
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
          paymentAccounts={debtPaymentAccounts}
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
