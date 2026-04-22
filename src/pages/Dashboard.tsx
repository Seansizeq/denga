import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTransactions } from '../context/TransactionContext';
import Header from '../components/ui/Header';
import HeroBalance from '../components/ui/HeroBalance';
import AccountsSnapshot from '../components/ui/AccountsSnapshot';
import QuickActions from '../components/ui/QuickActions';
import RecentTransactions from '../components/ui/RecentTransactions';
import type { RangeFilter } from '../components/ui/RecentTransactions';
import { getCustomCategoryName } from '../constants/categories';
import { translations, type CategoryKey } from '../i18n/translations';
import styles from './Dashboard.module.css';

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

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { transactions, deleteTransaction } = useTransactions();
  const [range, setRange] = useState<RangeFilter>('today');

  const inRange = useMemo(() => {
    const now = new Date();
    return (iso: string) => {
      const d = new Date(iso);
      if (range === 'all') return true;
      if (range === 'today') return d.toDateString() === now.toDateString();
      if (range === 'week') {
        const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        return diff <= 7;
      }
      if (range === 'month') {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      return true;
    };
  }, [range]);

  const filtered = useMemo(
    () => transactions.filter((tx) => inRange(tx.date)),
    [transactions, inRange],
  );

  const summary = useMemo(() => {
    const totals = transactions.reduce(
      (acc, tx) => {
        if (tx.type === 'income') acc.income += tx.amount;
        else acc.expense += tx.amount;
        return acc;
      },
      { income: 0, expense: 0 },
    );

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
      totalIncome: totals.income,
      totalExpense: totals.expense,
      totalNet: totals.income - totals.expense,
      sources: Array.from(sourceMap.values()).sort((a, b) => b.amount - a.amount),
      byCurrency: Array.from(currencyMap.entries())
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    };
  }, [transactions]);

  const accountSections = useMemo(() => {
    const sections = {
      bank: {
        id: 'bank',
        title: 'Рахунки',
        total: '',
        rows: [] as Array<{ id: string; name: string; amount: string; badge: string }>,
      },
      cash: {
        id: 'cash',
        title: 'Готівка',
        total: '',
        rows: [] as Array<{ id: string; name: string; amount: string; badge: string }>,
      },
      crypto: {
        id: 'crypto',
        title: 'Акції та Крипта',
        total: '',
        rows: [] as Array<{ id: string; name: string; amount: string; subAmount?: string; badge: string }>,
      },
      debt: {
        id: 'debt',
        title: 'Борг',
        total: '',
        rows: [] as Array<{ id: string; name: string; amount: string; badge: string }>,
      },
    };

    const accountMeta: Record<
      string,
      { section: 'bank' | 'cash' | 'crypto' | 'debt'; label: string; badge: string; debtPhrase?: string }
    > = {
      pumb: { section: 'bank', label: 'pumb', badge: 'P' },
      privat24: { section: 'bank', label: 'Privat24', badge: 'PB' },
      wallet: { section: 'cash', label: 'Wallet', badge: 'W' },
      crypto: { section: 'crypto', label: 'crypto', badge: '₿' },
      sol: { section: 'crypto', label: 'sol', badge: 'S' },
      ton: { section: 'crypto', label: 'Ton', badge: 'T' },
      usdt: { section: 'crypto', label: 'usdt', badge: 'U' },
      misha: { section: 'debt', label: 'Misha', badge: 'M', debtPhrase: 'мені винні' },
    };

    const accountTotals = new Map<string, { fiatAmount: number; fiatCurrency: string; byCurrency: Map<string, number> }>();
    transactions.forEach((tx) => {
      const key = tx.categoryId.trim().toLowerCase();
      const meta = accountMeta[key];
      if (!meta) return;
      const sign = tx.type === 'income' ? 1 : -1;
      const currency = getCurrencyFromNote(tx.note);
      const isFiat = currency === 'UAH' || currency === 'PLN';
      const current = accountTotals.get(key) ?? { fiatAmount: 0, fiatCurrency: 'PLN', byCurrency: new Map() };
      current.byCurrency.set(currency, (current.byCurrency.get(currency) ?? 0) + sign * tx.amount);
      if (isFiat) {
        current.fiatAmount += sign * tx.amount;
        current.fiatCurrency = currency;
      }
      accountTotals.set(key, current);
    });

    const pushAccount = (key: keyof typeof accountMeta) => {
      const meta = accountMeta[key];
      const total = accountTotals.get(key);
      if (!meta || !total) return;
      const amountText = formatGroupAmount(total.fiatAmount, total.fiatCurrency);
      const firstNonFiat = Array.from(total.byCurrency.entries()).find(
        ([currency, amount]) => currency !== 'UAH' && currency !== 'PLN' && amount > 0,
      );
      const row = {
        id: key,
        name: meta.label,
        amount: meta.debtPhrase ? `${meta.debtPhrase} ${amountText}` : amountText,
        subAmount: firstNonFiat ? `${Math.abs(firstNonFiat[1]).toLocaleString('ru-RU', { maximumFractionDigits: 8 })} ${firstNonFiat[0]}` : undefined,
        badge: meta.badge,
      };
      sections[meta.section].rows.push(row);
    };

    pushAccount('pumb');
    pushAccount('privat24');
    pushAccount('wallet');
    pushAccount('crypto');
    pushAccount('sol');
    pushAccount('ton');
    pushAccount('usdt');
    pushAccount('misha');

    const calculateSectionTotal = (rows: Array<{ id: string }>, defaultCurrency = 'UAH') => {
      if (!rows.length) return `0 ${defaultCurrency === 'PLN' ? 'zł' : defaultCurrency}`;
      const first = accountTotals.get(rows[0].id);
      const currency = first?.fiatCurrency ?? defaultCurrency;
      const sum = rows.reduce((acc, row) => acc + (accountTotals.get(row.id)?.fiatAmount ?? 0), 0);
      return formatGroupAmount(sum, currency);
    };

    sections.bank.total = calculateSectionTotal(sections.bank.rows, 'UAH');
    sections.cash.total = calculateSectionTotal(sections.cash.rows, 'PLN');
    sections.crypto.total = calculateSectionTotal(sections.crypto.rows, 'PLN');
    sections.debt.total = calculateSectionTotal(sections.debt.rows, 'PLN');

    return [sections.bank, sections.cash, sections.crypto, sections.debt];
  }, [transactions]);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <Header />

        <HeroBalance
          net={summary.totalNet}
          income={summary.totalIncome}
          expense={summary.totalExpense}
          sources={summary.sources}
          byCurrency={summary.byCurrency}
        />

        <AccountsSnapshot sections={accountSections} />

        <QuickActions />

        <RecentTransactions
          transactions={filtered}
          onDelete={deleteTransaction}
          onEdit={(id) => navigate(`/add?edit=${id}`)}
          filter={range}
          onFilterChange={setRange}
          showSeeAll
        />

        <div className={styles.spacer} />
      </div>
    </div>
  );
};

export default Dashboard;
