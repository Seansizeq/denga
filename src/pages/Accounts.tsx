import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/ui/Header';
import AccountsSnapshot from '../components/ui/AccountsSnapshot';
import AccountEditSheet, { type EditableAccount } from '../components/ui/AccountEditSheet';
import { useTransactions } from '../context/TransactionContext';
import { getCustomCategoryName } from '../constants/categories';
import { translations, type CategoryKey } from '../i18n/translations';
import { useTranslation } from '../i18n/LanguageContext';
import styles from './Accounts.module.css';

const API_URL = import.meta.env.VITE_API_URL ?? '';

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
  debtPhrase: r.debtPhrase ?? '',
});

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

const getCurrencyFromNote = (note?: string): string => {
  if (!note) return 'UAH';
  const match = note.match(/Currency:\s*([A-Za-z#0-9_-]+)/i);
  const raw = match?.[1]?.toUpperCase();
  if (!raw) return 'UAH';
  if (raw.startsWith('C#')) return raw.slice(2).toUpperCase();
  return raw;
};

const normalizeLabel = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const Accounts: React.FC = () => {
  const { t, locale } = useTranslation();
  const { transactions } = useTransactions();
  const [portfolio, setPortfolio] = useState<readonly PortfolioAccountRow[]>([]);
  const [editing, setEditing] = useState<EditableAccount | null>(null);

  const loadPortfolio = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/accounts`);
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

  const details = useMemo(() => {
    const categoryLabel = (id: string) => {
      const builtIn = translations.ru.categories[id as CategoryKey];
      if (builtIn) return builtIn;
      return getCustomCategoryName(id) ?? id;
    };

    const sourceMap = new Map<string, { id: string; label: string; amount: number; count: number }>();
    transactions
      .filter((tx) => tx.type === 'income')
      .forEach((tx) => {
        const key = tx.categoryId;
        const current = sourceMap.get(key) ?? {
          id: key,
          label: categoryLabel(key),
          amount: 0,
          count: 0,
        };
        current.amount += tx.amount;
        current.count += 1;
        sourceMap.set(key, current);
      });

    const currencyMap = new Map<string, number>();
    transactions.forEach((tx) => {
      const currency = getCurrencyFromNote(tx.note);
      const sign = tx.type === 'income' ? 1 : -1;
      currencyMap.set(currency, (currencyMap.get(currency) ?? 0) + sign * tx.amount);
    });

    return {
      sources: Array.from(sourceMap.values()).sort((a, b) => b.amount - a.amount),
      byCurrency: Array.from(currencyMap.entries())
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    };
  }, [transactions]);

  const txSections = useMemo(() => {
    const base = {
      bank: {
        id: 'bank',
        title: '',
        total: '',
        variant: 'strip' as const,
        collapsible: false,
        defaultOpen: true,
        rows: [] as Array<{
          id: string;
          name: string;
          amount: string;
          badge: string;
          subAmount?: string;
          iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral';
        }>,
      },
      cash: {
        id: 'cash',
        title: 'Готівка',
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
        }>,
      },
      crypto: {
        id: 'crypto',
        title: 'Акції та Крипта',
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
        }>,
      },
      debt: {
        id: 'debt',
        title: 'Борг',
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
        }>,
      },
    };

    const accountMeta: Record<
      string,
      { section: 'bank' | 'cash' | 'crypto' | 'debt'; label: string; badge: string; debtPhrase?: string; aliases?: string[] }
    > = {
      pumb: { section: 'bank', label: 'pumb', badge: 'P', aliases: ['pumb uah', 'пумб'] },
      privat24: { section: 'bank', label: 'Privat24', badge: 'PB', aliases: ['privat', 'приват24', 'приват'] },
      wallet: { section: 'cash', label: 'Wallet', badge: 'W', aliases: ['готівка', 'кеш'] },
      crypto: { section: 'crypto', label: 'crypto', badge: '₿' },
      sol: { section: 'crypto', label: 'sol', badge: 'S' },
      ton: { section: 'crypto', label: 'Ton', badge: 'T' },
      usdt: { section: 'crypto', label: 'usdt', badge: 'U', aliases: ['tether', 'usdc'] },
      misha: { section: 'debt', label: 'Misha', badge: 'M', debtPhrase: 'мені винні', aliases: ['миша'] },
    };

    const aliasToKey = new Map<string, keyof typeof accountMeta>();
    (Object.keys(accountMeta) as Array<keyof typeof accountMeta>).forEach((k) => {
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

    const resolveAccountKey = (rawCategoryId: string): keyof typeof accountMeta | null => {
      const id = rawCategoryId.trim();
      if (!id) return null;

      const direct = id.toLowerCase();
      if (accountMeta[direct as keyof typeof accountMeta]) {
        return direct as keyof typeof accountMeta;
      }

      const fromCustomName = getCustomCategoryName(id);
      if (fromCustomName) {
        const hit = aliasToKey.get(normalizeLabel(fromCustomName));
        if (hit) return hit;
      }

      // Last resort: try loose substring match for known account labels
      const hay = normalizeLabel(`${fromCustomName ?? ''} ${id}`);
      for (const [alias, k] of aliasToKey.entries()) {
        if (!alias) continue;
        if (hay.includes(alias)) return k;
      }

      return null;
    };

    (Object.keys(accountMeta) as Array<keyof typeof accountMeta>).forEach((k) => {
      accountTotals.set(String(k), emptyTotals());
    });

    transactions.forEach((tx) => {
      const key = resolveAccountKey(tx.categoryId);
      if (!key) return;
      const meta = accountMeta[key];
      if (!meta) return;
      const sign = tx.type === 'income' ? 1 : -1;
      const currency = getCurrencyFromNote(tx.note);
      const isFiat = currency === 'UAH' || currency === 'PLN';
      const current = accountTotals.get(String(key)) ?? emptyTotals();
      current.byCurrency.set(currency, (current.byCurrency.get(currency) ?? 0) + sign * tx.amount);
      if (isFiat) {
        if (currency === 'PLN') current.pln += sign * tx.amount;
        else current.uah += sign * tx.amount;
      }
      accountTotals.set(String(key), current);
    });

    const pushAccount = (key: keyof typeof accountMeta) => {
      const meta = accountMeta[key];
      const total = accountTotals.get(String(key)) ?? emptyTotals();
      const primary = pickPrimaryFiat(total);
      const amountText = formatGroupAmount(primary.amount, primary.currency);
      const firstNonFiat = Array.from(total.byCurrency.entries()).find(
        ([currency, amount]) => currency !== 'UAH' && currency !== 'PLN' && amount > 0
      );
      const iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral' =
        key === 'misha' ? 'debt' : meta.section === 'bank' ? 'bank' : meta.section;
      base[meta.section].rows.push({
        id: String(key),
        name: meta.label,
        amount: meta.debtPhrase ? `${meta.debtPhrase} ${amountText}` : amountText,
        badge: meta.badge,
        iconTone,
        subAmount: firstNonFiat
          ? `${Math.abs(firstNonFiat[1]).toLocaleString('ru-RU', { maximumFractionDigits: 8 })} ${firstNonFiat[0]}`
          : undefined,
      });
    };

    pushAccount('pumb');
    pushAccount('privat24');
    pushAccount('wallet');
    pushAccount('crypto');
    pushAccount('sol');
    pushAccount('ton');
    pushAccount('usdt');
    pushAccount('misha');

    const calculateSectionTotal = (rows: Array<{ id: string }>, defaultCurrency: 'UAH' | 'PLN' = 'UAH') => {
      if (!rows.length) return `0 ${defaultCurrency === 'PLN' ? 'zł' : defaultCurrency}`;
      const sums = rows.reduce(
        (acc, row) => {
          const t = accountTotals.get(row.id) ?? emptyTotals();
          acc.uah += t.uah;
          acc.pln += t.pln;
          return acc;
        },
        { uah: 0, pln: 0 },
      );
      if (defaultCurrency === 'PLN') {
        return formatGroupAmount(sums.pln, 'PLN');
      }
      // Bank section is UAH-first in UI; if there is no UAH but PLN exists, show PLN.
      if (Math.abs(sums.uah) >= Math.abs(sums.pln)) {
        return formatGroupAmount(sums.uah, 'UAH');
      }
      return formatGroupAmount(sums.pln, 'PLN');
    };

    base.bank.total = calculateSectionTotal(base.bank.rows, 'UAH');
    base.cash.total = calculateSectionTotal(base.cash.rows, 'PLN');
    base.crypto.total = calculateSectionTotal(base.crypto.rows, 'PLN');
    base.debt.total = calculateSectionTotal(base.debt.rows, 'PLN');

    return [base.bank, base.cash, base.crypto, base.debt];
  }, [transactions]);

  const portfolioSnapshotSections = useMemo(() => {
    type Row = {
      id: string;
      name: string;
      amount: string;
      badge: string;
      subAmount?: string;
      iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral';
    };

    const rowsFor = (key: PortfolioSection) =>
      portfolio
        .filter((r) => r.section === key)
        .slice()
        .sort((a, b) => a.sortIndex - b.sortIndex || a.accountKey.localeCompare(b.accountKey))
        .map((r) => {
          const fiat = formatGroupAmount(r.primaryAmount, r.primaryCurrency);
          const amount = r.debtPhrase?.trim() ? `${r.debtPhrase.trim()} ${fiat}` : fiat;
          const subAmount = r.subText?.trim() ? r.subText.trim() : undefined;
          const badge = (r.badge ?? '').trim() || r.name.slice(0, 1);
          return {
            id: r.accountKey,
            name: r.name,
            amount,
            badge,
            subAmount,
            iconTone: r.iconTone,
          } satisfies Row;
        });

    const sumSectionFiat = (key: PortfolioSection, preferred: 'UAH' | 'PLN') => {
      const list = portfolio.filter((r) => r.section === key);
      if (!list.length) {
        return preferred === 'PLN' ? '0 zł' : '0 UAH';
      }
      const sumPreferred = list.filter((r) => r.primaryCurrency === preferred).reduce((a, r) => a + r.primaryAmount, 0);
      const other: 'UAH' | 'PLN' = preferred === 'PLN' ? 'UAH' : 'PLN';
      const sumOther = list.filter((r) => r.primaryCurrency === other).reduce((a, r) => a + r.primaryAmount, 0);
      if (Math.abs(sumOther) > 0 && Math.abs(sumPreferred) === 0) {
        return formatGroupAmount(sumOther, other);
      }
      return formatGroupAmount(sumPreferred, preferred);
    };

    const bankRows = rowsFor('bank');
    const cashRows = rowsFor('cash');
    const cryptoRows = rowsFor('crypto');
    const debtRows = rowsFor('debt');

    return [
      {
        id: 'bank',
        title: '',
        total: '',
        variant: 'strip' as const,
        collapsible: false,
        defaultOpen: true,
        rows: bankRows,
      },
      {
        id: 'cash',
        title: 'Готівка',
        total: sumSectionFiat('cash', 'PLN'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: cashRows,
      },
      {
        id: 'crypto',
        title: 'Акції та Крипта',
        total: sumSectionFiat('crypto', 'PLN'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: cryptoRows,
      },
      {
        id: 'debt',
        title: 'Борг',
        total: sumSectionFiat('debt', 'PLN'),
        variant: 'strip' as const,
        collapsible: true,
        defaultOpen: true,
        rows: debtRows,
      },
    ];
  }, [portfolio]);

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
      const res = await fetch(`${API_URL}/api/accounts/${encodeURIComponent(next.accountKey)}`, {
        method: 'PUT',
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

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <Header />
        <section className={styles.details}>
          <div className={styles.detailCard}>
            <p className={styles.detailTitle}>{t('balance', 'byCurrency')}</p>
            {details.byCurrency.length === 0 ? (
              <p className={styles.emptyRow}>—</p>
            ) : (
              <ul className={styles.list}>
                {details.byCurrency.map((item) => (
                  <li key={item.currency} className={styles.listRow}>
                    <span>{item.currency}</span>
                    <strong
                      className={item.amount < 0 ? styles.valueNeg : item.amount > 0 ? styles.valuePos : styles.valueZero}
                    >
                      {item.amount < 0 ? '−' : '+'}
                      {Math.abs(item.amount).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.detailCard}>
            <p className={styles.detailTitle}>{t('balance', 'moneySources')}</p>
            {details.sources.length === 0 ? (
              <p className={styles.emptyRow}>—</p>
            ) : (
              <ul className={styles.list}>
                {details.sources.map((source) => (
                  <li key={source.id} className={styles.listRow}>
                    <span>
                      {source.label} ({source.count})
                    </span>
                    <strong>+{source.amount.toLocaleString(locale, { maximumFractionDigits: 2 })}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <AccountsSnapshot sections={sections} onRowPress={portfolio.length > 0 ? handleRowPress : undefined} />
        <div className={styles.spacer} />
      </div>
      {editing ? (
        <AccountEditSheet
          key={editing.accountKey}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={handleSaveAccount}
        />
      ) : null}
    </div>
  );
};

export default Accounts;
