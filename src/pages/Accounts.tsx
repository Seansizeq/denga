import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import Header from '../components/ui/Header';
import AccountsSnapshot from '../components/ui/AccountsSnapshot';
import AccountEditSheet, { type EditableAccount } from '../components/ui/AccountEditSheet';
import { useTransactions } from '../context/TransactionContext';
import { getCustomCategoryName } from '../constants/categories';
import { getAccountSlugFromNote } from '../utils/transactionAccount';
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

const normalizeLabel = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const Accounts: React.FC = () => {
  const { t, displayCurrency, convertAmount } = useTranslation();
  const { transactions } = useTransactions();
  const [portfolio, setPortfolio] = useState<readonly PortfolioAccountRow[]>([]);
  const [editing, setEditing] = useState<EditableAccount | null>(null);
  const [cryptoUsdPrices, setCryptoUsdPrices] = useState<Record<string, number>>({});

  const loadPortfolio = useCallback(async () => {
    try {
      const res = await apiFetch('/api/accounts');
      if (!res.ok) return;
      const data: unknown = await res.json();
      if (!Array.isArray(data)) return;
      const next = data.map(parsePortfolioRow).filter((r): r is PortfolioAccountRow => Boolean(r));
      setPortfolio(next);
    } catch {
      // ignore: fallback to transaction-derived view
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadPortfolio();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadPortfolio]);

  useEffect(() => {
    let cancelled = false;
    const loadCryptoPrices = async () => {
      try {
        const res = await apiFetch('/api/crypto-prices');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const prices = (data?.prices ?? {}) as Record<string, unknown>;
        const normalized: Record<string, number> = {};
        for (const [k, v] of Object.entries(prices)) {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) normalized[k.toUpperCase()] = n;
        }
        if (!cancelled) setCryptoUsdPrices(normalized);
      } catch {
        if (!cancelled) setCryptoUsdPrices({});
      }
    };
    void loadCryptoPrices();
    const id = window.setInterval(() => void loadCryptoPrices(), 120000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const txSections = useMemo(() => {
    const base = {
      bank: {
        id: 'bank',
        title: t('balance', 'sectionBank'),
        total: '',
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: [] as Array<{
          id: string;
          name: string;
          amount: string;
          badge: string;
          subAmount?: string;
          iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral';
          section: PortfolioSection;
          iconKey?: string | null;
          cryptoSymbol?: string | null;
        }>,
      },
      cash: {
        id: 'cash',
        title: t('balance', 'sectionCash'),
        total: '',
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: [] as Array<{
          id: string;
          name: string;
          amount: string;
          badge: string;
          subAmount?: string;
          iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral';
          section: PortfolioSection;
          iconKey?: string | null;
          cryptoSymbol?: string | null;
        }>,
      },
      crypto: {
        id: 'crypto',
        title: t('balance', 'sectionCrypto'),
        total: '',
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: [] as Array<{
          id: string;
          name: string;
          amount: string;
          badge: string;
          subAmount?: string;
          iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral';
          section: PortfolioSection;
          iconKey?: string | null;
          cryptoSymbol?: string | null;
        }>,
      },
      debt: {
        id: 'debt',
        title: t('balance', 'sectionDebt'),
        total: '',
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: [] as Array<{
          id: string;
          name: string;
          amount: string;
          badge: string;
          subAmount?: string;
          iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral';
          section: PortfolioSection;
          iconKey?: string | null;
          cryptoSymbol?: string | null;
        }>,
      },
    };

    const accountMeta: Record<
      string,
      {
        section: 'bank' | 'cash' | 'crypto' | 'debt';
        label: string;
        badge: string;
        iconKey?: string | null;
        debtPhrase?: string;
        aliases?: string[];
      }
    > = {
      pumb: { section: 'bank', label: 'pumb', badge: 'P', aliases: ['pumb uah', 'пумб'] },
      privat24: { section: 'bank', label: 'Privat24', badge: 'PB', aliases: ['privat', 'приват24', 'приват'] },
      wallet: { section: 'cash', label: 'Wallet', badge: 'W', aliases: ['готівка', 'кеш'] },
      crypto: { section: 'crypto', label: 'crypto', badge: 'ETH' },
      sol: { section: 'crypto', label: 'sol', badge: 'S' },
      ton: { section: 'crypto', label: 'Ton', badge: 'T' },
      usdt: { section: 'crypto', label: 'usdt', badge: 'U', aliases: ['tether', 'usdc'] },
      misha: { section: 'debt', label: 'Misha', badge: 'M', debtPhrase: 'мені винні', aliases: ['миша'] },
    };

    for (const row of portfolio) {
      const k = row.accountKey.trim().toLowerCase();
      if (!k) continue;
      const badgeRaw = (row.badge ?? '').trim();
      const nameRaw = row.name.trim() || k;
      const badge =
        badgeRaw.slice(0, 2).toUpperCase() ||
        nameRaw.replace(/[^a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9]/g, '').slice(0, 2).toUpperCase() ||
        k.slice(0, 2).toUpperCase();
      const prev = accountMeta[k];
      accountMeta[k] = {
        section: row.section,
        label: nameRaw,
        badge: badge.slice(0, 2),
        iconKey: row.iconKey ?? prev?.iconKey ?? null,
        debtPhrase:
          row.section === 'debt' && row.debtPhrase?.trim()
            ? row.debtPhrase.trim()
            : prev?.debtPhrase,
        aliases: prev?.aliases,
      };
    }

    transactions.forEach((tx) => {
      const slug = getAccountSlugFromNote(tx.note);
      if (!slug || accountMeta[slug]) return;
      accountMeta[slug] = {
        section: 'bank',
        label: slug,
        badge: slug.slice(0, 2).toUpperCase(),
      };
    });

    const aliasToKey = new Map<string, string>();
    (Object.keys(accountMeta) as string[]).forEach((k) => {
      const meta = accountMeta[k];
      aliasToKey.set(normalizeLabel(String(k)), k);
      aliasToKey.set(normalizeLabel(meta.label), k);
      for (const a of meta.aliases ?? []) {
        aliasToKey.set(normalizeLabel(a), k);
      }
    });

    type AccountTotals = {
      uah: number;
      pln: number;
      byCurrency: Map<string, number>;
    };

    const emptyTotals = (): AccountTotals => ({
      uah: 0,
      pln: 0,
      byCurrency: new Map<string, number>(),
    });

    const pickPrimaryFiat = (totals: AccountTotals): { amount: number; currency: 'UAH' | 'PLN' } => {
      const aU = Math.abs(totals.uah);
      const aP = Math.abs(totals.pln);
      if (aU === 0 && aP === 0) return { amount: 0, currency: 'PLN' };
      if (aP >= aU) return { amount: totals.pln, currency: 'PLN' };
      return { amount: totals.uah, currency: 'UAH' };
    };

    const accountTotals = new Map<string, AccountTotals>();

    const resolveAccountKey = (rawCategoryId: string): string | null => {
      const id = rawCategoryId.trim();
      if (!id) return null;

      const direct = id.toLowerCase();
      if (accountMeta[direct]) {
        return direct;
      }

      const fromCustomName = getCustomCategoryName(id);
      if (fromCustomName) {
        const hit = aliasToKey.get(normalizeLabel(fromCustomName));
        if (hit) return hit;
      }

      const hay = normalizeLabel(`${fromCustomName ?? ''} ${id}`);
      for (const [alias, k] of aliasToKey.entries()) {
        if (!alias) continue;
        if (hay.includes(alias)) return k;
      }

      return null;
    };

    const resolveTransactionAccountKey = (tx: { categoryId: string; note?: string }): string | null => {
      const fromNote = getAccountSlugFromNote(tx.note);
      if (fromNote && accountMeta[fromNote]) {
        return fromNote;
      }
      return resolveAccountKey(tx.categoryId);
    };

    (Object.keys(accountMeta) as string[]).forEach((k) => {
      accountTotals.set(String(k), emptyTotals());
    });

    transactions.forEach((tx) => {
      const key = resolveTransactionAccountKey(tx);
      if (!key) return;
      const meta = accountMeta[key as string];
      if (!meta) return;
      const sign = tx.type === 'income' ? 1 : -1;
      const currency = tx.currency;
      const isFiat = currency === 'UAH' || currency === 'PLN';
      const current = accountTotals.get(String(key)) ?? emptyTotals();
      current.byCurrency.set(currency, (current.byCurrency.get(currency) ?? 0) + sign * tx.amount);
      if (isFiat) {
        if (currency === 'PLN') current.pln += sign * tx.amount;
        else current.uah += sign * tx.amount;
      }
      accountTotals.set(String(key), current);
    });

    const pushAccount = (key: string) => {
      const meta = accountMeta[key];
      const total = accountTotals.get(String(key)) ?? emptyTotals();
      const primary = pickPrimaryFiat(total);
      const amountText = formatGroupAmount(primary.amount, primary.currency);
      const firstNonFiat = Array.from(total.byCurrency.entries()).find(
        ([currency, amount]) => currency !== 'UAH' && currency !== 'PLN' && amount > 0
      );
      const iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral' =
        meta.section === 'debt' ? 'debt' : meta.section === 'bank' ? 'bank' : meta.section;
      const cur = firstNonFiat?.[0]?.toUpperCase() ?? '';
      const cryptoFromFiat =
        meta.section === 'crypto' && ['BTC', 'ETH', 'SOL', 'TON', 'USDT'].includes(cur) ? cur : null;
      base[meta.section].rows.push({
        id: String(key),
        name: meta.label,
        amount: meta.debtPhrase ? `${meta.debtPhrase} ${amountText}` : amountText,
        badge: meta.badge,
        iconTone,
        section: meta.section,
        iconKey: meta.iconKey ?? null,
        cryptoSymbol: cryptoFromFiat,
        subAmount: firstNonFiat
          ? `${Math.abs(firstNonFiat[1]).toLocaleString('ru-RU', { maximumFractionDigits: 8 })} ${firstNonFiat[0]}`
          : undefined,
      });
    };

    const ROW_KEY_ORDER = ['pumb', 'privat24', 'wallet', 'crypto', 'sol', 'ton', 'usdt', 'misha'];
    const orderedAccountKeys = [
      ...ROW_KEY_ORDER.filter((k) => accountMeta[k]),
      ...Object.keys(accountMeta)
        .filter((k) => !ROW_KEY_ORDER.includes(k))
        .sort((a, b) => a.localeCompare(b)),
    ];
    orderedAccountKeys.forEach((k) => pushAccount(k));

    const calculateSectionTotal = (rows: Array<{ id: string }>) => {
      if (!rows.length) return formatGroupAmount(0, displayCurrency);
      const sumDisplay = rows.reduce((acc, row) => {
        const totals = accountTotals.get(row.id) ?? emptyTotals();
        for (const [currency, amount] of totals.byCurrency.entries()) {
          acc += convertAmount(amount, currency as 'UAH' | 'PLN' | 'USD', displayCurrency);
        }
        return acc;
      }, 0);
      return formatGroupAmount(sumDisplay, displayCurrency);
    };

    base.bank.total = calculateSectionTotal(base.bank.rows);
    base.cash.total = calculateSectionTotal(base.cash.rows);
    base.crypto.total = calculateSectionTotal(base.crypto.rows);
    base.debt.total = calculateSectionTotal(base.debt.rows);

    return [base.bank, base.cash, base.crypto, base.debt];
  }, [transactions, t, portfolio, convertAmount, displayCurrency]);

  const portfolioSnapshotSections = useMemo(() => {
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
      if (!list.length) {
        return formatGroupAmount(0, displayCurrency);
      }
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

    const bankRows = rowsFor('bank');
    const cashRows = rowsFor('cash');
    const cryptoRows = rowsFor('crypto');
    const debtRows = rowsFor('debt');

    return [
      {
        id: 'bank',
        title: t('balance', 'sectionBank'),
        total: sumSectionFiat('bank'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: bankRows,
      },
      {
        id: 'cash',
        title: t('balance', 'sectionCash'),
        total: sumSectionFiat('cash'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: cashRows,
      },
      {
        id: 'crypto',
        title: t('balance', 'sectionCrypto'),
        total: sumSectionFiat('crypto'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: cryptoRows,
      },
      {
        id: 'debt',
        title: t('balance', 'sectionDebt'),
        total: sumSectionFiat('debt'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: debtRows,
      },
    ];
  }, [portfolio, t, convertAmount, displayCurrency, cryptoUsdPrices]);

  const sections = portfolio.length > 0 ? portfolioSnapshotSections : txSections;

  const handleRowPress = useCallback(
    (id: string) => {
      const row = portfolio.find((r) => r.accountKey === id);
      if (!row) return;
      setEditing(mapPortfolioToEditable(row));
    },
    [portfolio]
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
      await loadPortfolio();
    },
    [loadPortfolio]
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
      await loadPortfolio();
    },
    [loadPortfolio]
  );

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <Header />
        {portfolio.length > 0 ? (
          <button
            type="button"
            className={styles.addButton}
            onClick={() => setEditing(createEmptyAccount('bank', portfolio))}
            aria-label="Додати акаунт"
          >
            <Plus size={18} strokeWidth={2.6} />
            <span>Додати рахунок</span>
          </button>
        ) : null}
        <AccountsSnapshot sections={sections} onRowPress={portfolio.length > 0 ? handleRowPress : undefined} />
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
