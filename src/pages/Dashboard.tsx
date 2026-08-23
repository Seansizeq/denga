import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import { useTranslation } from '../i18n/LanguageContext';
import { showAppAlert } from '../utils/notify';
import { usePortfolio } from '../context/PortfolioContext';
import Header from '../components/ui/Header';
import HeroBalance from '../components/ui/HeroBalance';
import QuickActions from '../components/ui/QuickActions';
import AiQuickAdd from '../components/AiQuickAdd';
import RecentTransactions from '../components/ui/RecentTransactions';
import type { RangeFilter } from '../components/ui/RecentTransactions';
import { isWithinLastDays } from '../utils/dateRanges';
import { isBalanceCorrection } from '../utils/transactionUtils';
import {
  computePortfolioMonthStartUahPln,
  computeWealthMonthChangePercent,

  portfolioNeedsCryptoHistory,
  priorNetInDisplayCurrency,
  type PortfolioRowInput,
} from '../utils/portfolioMonthChange';
import { normalizeDenomination } from '../utils/denomination';
import { useDenominationRates } from '../hooks/useDenominationRates';
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
    primaryCurrency: normalizeDenomination(
      typeof row.primaryCurrency === 'string' ? row.primaryCurrency : undefined,
    ),
    subText: typeof row.subText === 'string' ? row.subText : null,
    debtDirection: row.debtDirection === 'owed_by_me' ? 'owed_by_me' : 'owed_to_me',
  };
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t, displayCurrency, convertAmount } = useTranslation();
  const { transactions, deleteTransaction } = useTransactions();
  const { accounts, cryptoUsdHistory, refreshCryptoHistory } = usePortfolio();
  const { convert } = useDenominationRates();
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

  // Підсумок рахується за той самий період, що показує фільтр під ним.
  // Раніше зверху була сума за весь час, а список — за «сьогодні».
  const summary = useMemo(() => {
    const totals = filtered.reduce(
      (acc, tx) => {
        // Корекція балансу не є ні доходом, ні витратою.
        if (isBalanceCorrection(tx)) return acc;
        // Crypto-denominated rows are skipped when unpriced rather than
        // counted as if one token were one hryvnia.
        const amountInDisplay = convert(tx.amount, tx.currency) ?? 0;
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
  }, [filtered, convert]);

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
      const denomination = normalizeDenomination(
        typeof row.primaryCurrency === 'string' ? row.primaryCurrency : undefined,
      );
      if (!Number.isFinite(baseAmount)) continue;

      // Two buckets keep the "you also hold X" line meaningful for the two
      // currencies actually spent day to day. Anything else — USD, crypto — is
      // carried as its hryvnia equivalent, so the net total stays exact.
      const bucket: 'UAH' | 'PLN' = denomination === 'PLN' ? 'PLN' : 'UAH';
      const amount = denomination === bucket ? baseAmount : convert(baseAmount, denomination, bucket);
      // An unpriced crypto position is left out rather than counted as zero-value fiat.
      if (amount === null) continue;

      // A debt someone else owes me is a receivable asset; a debt I owe is a liability
      // and must reduce net worth instead of inflating it.
      const signedAmount = section === 'debt' && row.debtDirection === 'owed_by_me' ? -amount : amount;
      if (bucket === 'PLN') pln += signedAmount;
      else uah += signedAmount;
    }
    return { uah, pln };
  }, [accounts, convert]);

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
    const priorBuckets = computePortfolioMonthStartUahPln({
      accounts: portfolioRows,
      transactions,
      convertAmount,
      cryptoHistory: needsHist ? cryptoUsdHistory : null,
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

        <AiQuickAdd />

        <QuickActions />

        <RecentTransactions
          transactions={filtered}
          onDelete={async (id) => {
            const ok = await deleteTransaction(id);
            if (!ok) showAppAlert(t('addTx', 'saveFailed'));
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
