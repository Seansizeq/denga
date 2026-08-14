import type { Transaction } from '../types';
import type { CurrencyCode } from './currency';
import {
  isCryptoDenomination,
  normalizeDenomination,
  type CryptoSymbol,
  type Denomination,
} from './denomination';
import { getTransactionAccountEffects } from './transactionUtils';

export type { CryptoSymbol } from './denomination';

export type PortfolioRowInput = {
  accountKey: string;
  section: string;
  primaryAmount: number;
  /** The unit the balance is counted in \u2014 fiat currency or crypto asset. */
  primaryCurrency: Denomination;
  subText?: string | null;
  debtDirection?: 'owed_to_me' | 'owed_by_me' | null;
};

export type CryptoUsdHistory = {
  pricesNow: Partial<Record<CryptoSymbol, number>>;
  pricesMonthStart: Partial<Record<CryptoSymbol, number>>;
};

/**
 * Balance change on an account since the start of the month.
 *
 * Only effects recorded in the account's own denomination count. Transfers made
 * before an account was re-denominated carry the old unit, and adding a figure
 * in hryvnia to a balance counted in tokens would produce nonsense.
 */
const sumAccountDeltasSinceMonthStart = (
  transactions: readonly Transaction[],
  accountKey: string,
  denomination: Denomination,
  now: Date,
): number => {
  let sum = 0;
  const key = accountKey.toLowerCase();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  for (const tx of transactions) {
    const timestamp = new Date(tx.date).getTime();
    if (!Number.isFinite(timestamp) || timestamp < monthStart.getTime() || timestamp > now.getTime()) continue;
    const effect = getTransactionAccountEffects(tx).find((row) => row.accountKey === key);
    if (!effect) continue;
    if (normalizeDenomination(effect.currency) !== denomination) continue;
    sum += effect.delta;
  }
  return sum;
};

export const portfolioNeedsCryptoHistory = (accounts: readonly PortfolioRowInput[]): boolean =>
  accounts.some((r) => isCryptoDenomination(r.primaryCurrency));

const historyCoversPosition = (history: CryptoUsdHistory, symbol: CryptoSymbol): boolean => {
  const current = history.pricesNow[symbol];
  const monthStart = history.pricesMonthStart[symbol];
  return (
    current !== undefined &&
    monthStart !== undefined &&
    Number.isFinite(current) &&
    current > 0 &&
    Number.isFinite(monthStart) &&
    monthStart > 0
  );
};

/**
 * Portfolio value at the start of the current calendar month. Fiat balances
 * are rolled back using linked transactions from month start through now;
 * crypto positions use the USD price captured near the first day of the month.
 */
export const computePortfolioMonthStartUahPln = (params: {
  accounts: readonly PortfolioRowInput[];
  transactions: readonly Transaction[];
  convertAmount: (amount: number, from: CurrencyCode, to?: CurrencyCode) => number;
  cryptoHistory: CryptoUsdHistory | null;
  now?: Date;
}): { uah: number; pln: number } | null => {
  const { accounts, transactions, convertAmount, cryptoHistory, now = new Date() } = params;

  if (portfolioNeedsCryptoHistory(accounts)) {
    if (!cryptoHistory) return null;
    for (const r of accounts) {
      if (!isCryptoDenomination(r.primaryCurrency)) continue;
      if (!historyCoversPosition(cryptoHistory, r.primaryCurrency)) return null;
    }
  }

  let uah = 0;
  let pln = 0;

  for (const r of accounts) {
    const section = String(r.section ?? '').trim().toLowerCase();
    const denomination = normalizeDenomination(r.primaryCurrency);
    const key = String(r.accountKey ?? '').trim().toLowerCase();
    const baseAmount = Number(r.primaryAmount);
    if (!Number.isFinite(baseAmount)) continue;

    // Roll the balance back to what it was on the 1st, in its own unit.
    const quantityAtMonthStart =
      baseAmount - sumAccountDeltasSinceMonthStart(transactions, key, denomination, now);

    // Same bucketing rule as the dashboard: UAH and PLN keep their own totals,
    // everything else is carried as its hryvnia equivalent.
    const bucket: CurrencyCode = denomination === 'PLN' ? 'PLN' : 'UAH';

    let amountPrimary: number;
    if (isCryptoDenomination(denomination)) {
      if (!cryptoHistory || !historyCoversPosition(cryptoHistory, denomination)) continue;
      // Valued at the price that applied at the start of the month, so the
      // change reflects both the position and the market move.
      const usdAtMonthStart = quantityAtMonthStart * (cryptoHistory.pricesMonthStart[denomination] as number);
      amountPrimary = convertAmount(usdAtMonthStart, 'USD', bucket);
    } else if (denomination !== bucket) {
      amountPrimary = convertAmount(quantityAtMonthStart, denomination, bucket);
    } else {
      amountPrimary = quantityAtMonthStart;
    }

    const signedAmountPrimary = section === 'debt' && r.debtDirection === 'owed_by_me' ? -amountPrimary : amountPrimary;
    if (bucket === 'PLN') pln += signedAmountPrimary;
    else uah += signedAmountPrimary;
  }

  return { uah, pln };
};

export const priorNetInDisplayCurrency = (
  prior: { uah: number; pln: number },
  convertAmount: (amount: number, from: CurrencyCode, to?: CurrencyCode) => number,
): number => convertAmount(prior.uah, 'UAH') + convertAmount(prior.pln, 'PLN');

/** Percentage change from the month-start net value. */
export const computeWealthMonthChangePercent = (
  mainNet: number,
  priorNet: number,
  epsilon = 1e-4,
): number | null => {
  const absPrior = Math.abs(priorNet);
  if (absPrior < epsilon) return null;
  return ((mainNet - priorNet) / absPrior) * 100;
};
