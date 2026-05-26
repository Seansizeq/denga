import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import { useTranslation } from '../i18n/LanguageContext';
import { usePortfolio } from '../context/PortfolioContext';
import Header from '../components/ui/Header';
import HeroBalance from '../components/ui/HeroBalance';
import QuickActions from '../components/ui/QuickActions';
import RecentTransactions from '../components/ui/RecentTransactions';
import type { RangeFilter } from '../components/ui/RecentTransactions';
import { isWithinLastDays } from '../utils/dateRanges';
import {
  computePortfolioPriorUahPln,
  computeWealthMonthChangePercent,
  parseCryptoPosition,
  portfolioNeedsCryptoHistory,
  priorNetInDisplayCurrency,
  type PortfolioRowInput,
} from '../utils/portfolioMonthChange';
import styles from './Dashboard.module.css';

type PortfolioWorth = { uah: number; pln: number };

const normalizeAccountRow = (row: Record<string, unknown>): PortfolioRowInput | null => {
  const accountKey = String(row.accountKey ?? '').trim().toLowerCase();
  if (!accountKey) return null;
  const primaryAmount = Number(row.primaryAmount);
  if (!Number.isFinite(primaryAmount)) return null;
  return {
    accountKey,
    section: String(row.section ?? ''),
    primaryAmount,
    primaryCurrency: row.primaryCurrency === 'PLN' ? 'PLN' : 'UAH',
    subText: typeof row.subText === 'string' ? row.subText : null,
  };
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t, displayCurrency, convertAmount } = useTranslation();
  const { transactions, deleteTransaction } = useTransactions();
  const { accounts, cryptoPrices, cryptoUsdHistory, refreshCryptoHistory } = usePortfolio();
  const [range, setRange] = useState<RangeFilter>('today');

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
        else if (tx.type === 'expense') acc.expense += amountInDisplay;
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

  const portfolioRows = useMemo<PortfolioRowInput[]>(() => {
    const rows: PortfolioRowInput[] = [];
    for (const row of accounts) {
      const normalized = normalizeAccountRow(row);
      if (normalized) rows.push(normalized);
    }
    return rows;
  }, [accounts]);

  const worth = useMemo<PortfolioWorth | null>(() => {
    if (accounts.length === 0) return null;
    let uah = 0;
    let pln = 0;
    for (const row of accounts) {
      const baseAmount = Number(row.primaryAmount);
      const section = String(row.section ?? '').trim().toLowerCase();
      const primaryCurrency = row.primaryCurrency === 'PLN' ? 'PLN' : 'UAH';
      if (!Number.isFinite(baseAmount)) continue;
      let amount = baseAmount;
      if (section === 'crypto') {
        const position = parseCryptoPosition(typeof row.subText === 'string' ? row.subText : null);
        const marketUsd = position ? (cryptoPrices[position.symbol] ?? 0) * position.amount : 0;
        if (marketUsd > 0) {
          amount = convertAmount(marketUsd, 'USD', primaryCurrency);
        }
      }
      if (primaryCurrency === 'PLN') pln += amount;
      else uah += amount;
    }
    return { uah, pln };
  }, [accounts, cryptoPrices, convertAmount]);

  const needsCryptoHistory = useMemo(
    () => portfolioNeedsCryptoHistory(portfolioRows),
    [portfolioRows],
  );

  useEffect(() => {
    if (needsCryptoHistory && !cryptoUsdHistory) {
      void refreshCryptoHistory();
    }
  }, [needsCryptoHistory, cryptoUsdHistory, refreshCryptoHistory]);

  const wealthMode = worth !== null;
  const usePlnMain = displayCurrency === 'PLN';
  const mainNet =
    wealthMode && worth
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

  const wealthMonthChangePct = useMemo(() => {
    if (!worth || !portfolioRows || portfolioRows.length === 0) return null;
    const needsHist = portfolioNeedsCryptoHistory(portfolioRows);
    if (needsHist && !cryptoUsdHistory) return null;
    const priorBuckets = computePortfolioPriorUahPln({
      accounts: portfolioRows,
      transactions,
      convertAmount,
      cryptoHistory: needsHist ? cryptoUsdHistory : null,
      windowDays: 30,
    });
    if (!priorBuckets) return null;
    const priorNet = priorNetInDisplayCurrency(priorBuckets, convertAmount);
    const main =
      convertAmount(worth.uah, 'UAH') + convertAmount(worth.pln, 'PLN');
    return computeWealthMonthChangePercent(main, priorNet);
  }, [worth, portfolioRows, cryptoUsdHistory, transactions, convertAmount]);

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
          wealthOther={
            wealthMode && wealthOther && wealthOther.currency !== 'UAH' ? wealthOther : undefined
          }
          wealthMonthChangePct={wealthMode ? wealthMonthChangePct : null}
          showTapHint={false}
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
