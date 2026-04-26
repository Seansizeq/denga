import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import { useTranslation } from '../i18n/LanguageContext';
import Header from '../components/ui/Header';
import HeroBalance from '../components/ui/HeroBalance';
import QuickActions from '../components/ui/QuickActions';
import RecentTransactions from '../components/ui/RecentTransactions';
import type { RangeFilter } from '../components/ui/RecentTransactions';
import { apiFetch } from '../api/client';
import { isWithinLastDays } from '../utils/dateRanges';
import styles from './Dashboard.module.css';

type PortfolioWorth = { uah: number; pln: number };
type CryptoSymbol = 'BTC' | 'ETH' | 'SOL' | 'TON' | 'USDT';

const parseCryptoPosition = (subText?: string | null): { symbol: CryptoSymbol; amount: number } | null => {
  if (!subText) return null;
  const m = subText.match(/([0-9][0-9\s\u00A0\u202F]*(?:[.,][0-9]+)?)\s*([A-Za-z]{3,5})/);
  if (!m?.[1] || !m?.[2]) return null;
  const amount = Number(m[1].replace(/[\s\u00A0\u202F]+/g, '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const symbol = m[2].toUpperCase();
  if (symbol === 'BTC' || symbol === 'ETH' || symbol === 'SOL' || symbol === 'TON' || symbol === 'USDT') {
    return { symbol, amount };
  }
  return null;
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t, displayCurrency, convertAmount } = useTranslation();
  const { transactions, deleteTransaction } = useTransactions();
  const [range, setRange] = useState<RangeFilter>('today');
  const [worth, setWorth] = useState<PortfolioWorth | null>(null);

  const inRange = useMemo(() => {
    const now = new Date();
    return (iso: string) => {
      const d = new Date(iso);
      if (range === 'today') return d.toDateString() === now.toDateString();
      if (range === 'week') {
        return isWithinLastDays(iso, 7, now);
      }
      if (range === 'month') {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      if (range === 'year') return d.getFullYear() === now.getFullYear();
      return false;
    };
  }, [range]);

  const filtered = useMemo(
    () => transactions.filter((tx) => inRange(tx.date)),
    [transactions, inRange],
  );

  const summary = useMemo(() => {
    const totals = transactions.reduce(
      (acc, tx) => {
        const amountInDisplay = convertAmount(tx.amount, tx.currency);
        if (tx.type === 'income') acc.income += amountInDisplay;
        else acc.expense += amountInDisplay;
        return acc;
      },
      { income: 0, expense: 0 },
    );

    return {
      totalIncome: totals.income,
      totalExpense: totals.expense,
      totalNet: totals.income - totals.expense,
    };
  }, [transactions, convertAmount]);

  const loadWorth = useCallback(async () => {
    try {
      const [accountsRes, cryptoRes] = await Promise.all([
        apiFetch('/api/accounts'),
        apiFetch('/api/crypto-prices'),
      ]);
      if (!accountsRes.ok) {
        setWorth(null);
        return;
      }
      const data: unknown = await accountsRes.json();
      if (!Array.isArray(data) || data.length === 0) {
        setWorth(null);
        return;
      }
      let cryptoUsdPrices: Record<string, number> = {};
      if (cryptoRes.ok) {
        const cryptoPayload = await cryptoRes.json();
        const prices = (cryptoPayload?.prices ?? {}) as Record<string, unknown>;
        const normalized: Record<string, number> = {};
        for (const [k, v] of Object.entries(prices)) {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) normalized[k.toUpperCase()] = n;
        }
        cryptoUsdPrices = normalized;
      }
      let uah = 0;
      let pln = 0;
      for (const row of data) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const baseAmount = Number(r.primaryAmount);
        const section = String(r.section ?? '').trim().toLowerCase();
        const primaryCurrency = r.primaryCurrency === 'PLN' ? 'PLN' : 'UAH';
        if (!Number.isFinite(baseAmount)) continue;
        let amount = baseAmount;
        if (section === 'crypto') {
          const position = parseCryptoPosition(typeof r.subText === 'string' ? r.subText : null);
          const marketUsd = position ? (cryptoUsdPrices[position.symbol] ?? 0) * position.amount : 0;
          if (marketUsd > 0) {
            amount = convertAmount(marketUsd, 'USD', primaryCurrency);
          }
        }
        if (primaryCurrency === 'PLN') pln += amount;
        else uah += amount;
      }
      setWorth({ uah, pln });
    } catch {
      setWorth(null);
    }
  }, [convertAmount]);

  useEffect(() => {
    void loadWorth();
    const id = window.setInterval(() => void loadWorth(), 5000);
    return () => window.clearInterval(id);
  }, [loadWorth]);

  const wealthMode = worth !== null;
  const usePlnMain = displayCurrency === 'PLN';
  const mainNet = wealthMode && worth
    ? convertAmount(worth.uah, 'UAH') + convertAmount(worth.pln, 'PLN')
    : summary.totalNet;
  const mainAmountCurrency = displayCurrency;
  const wealthOther =
    worth && wealthMode
      ? (() => {
          const { uah, pln } = worth;
          if (usePlnMain && uah > 0) return { amount: uah, currency: 'UAH' as const };
          if (!usePlnMain && pln > 0) return { amount: pln, currency: 'PLN' as const };
          return undefined;
        })()
      : undefined;

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.fabAdd}
        onClick={() => navigate('/add')}
        aria-label={t('dashboard', 'addTransaction')}
      >
        <Plus size={34} strokeWidth={2.4} />
      </button>

      <div className={styles.content}>
        <Header />

        <HeroBalance
          net={mainNet}
          income={summary.totalIncome}
          expense={summary.totalExpense}
          onOpenDetails={() => navigate('/accounts')}
          wealthMode={wealthMode}
          mainAmountCurrency={wealthMode ? mainAmountCurrency : 'UAH'}
          wealthOther={wealthMode ? wealthOther : undefined}
        />

        <QuickActions />

        <RecentTransactions
          transactions={filtered}
          onDelete={async (id) => {
            const ok = await deleteTransaction(id);
            if (!ok) window.alert(t('addTx', 'saveFailed'));
          }}
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
