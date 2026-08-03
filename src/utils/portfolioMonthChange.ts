import type { Transaction } from '../types';
import type { CurrencyCode } from './currency';
import { getTransactionAccountEffects } from './transactionUtils';

export type CryptoSymbol = 'BTC' | 'ETH' | 'SOL' | 'TON' | 'USDT';

export type PortfolioRowInput = {
  accountKey: string;
  section: string;
  primaryAmount: number;
  primaryCurrency: 'UAH' | 'PLN';
  subText?: string | null;
  debtDirection?: 'owed_to_me' | 'owed_by_me' | null;
};

export type CryptoUsdHistory = {
  pricesNow: Partial<Record<CryptoSymbol, number>>;
  pricesMonthStart: Partial<Record<CryptoSymbol, number>>;
};

export const parseCryptoPosition = (subText?: string | null): { symbol: CryptoSymbol; amount: number } | null => {
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

const sumAccountDeltasSinceMonthStart = (
  transactions: readonly Transaction[],
  accountKey: string,
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
    sum += effect.delta;
  }
  return sum;
};

export const portfolioNeedsCryptoHistory = (accounts: readonly PortfolioRowInput[]): boolean => {
  for (const r of accounts) {
    if (String(r.section).toLowerCase() !== 'crypto') continue;
    if (parseCryptoPosition(typeof r.subText === 'string' ? r.subText : null)) return true;
  }
  return false;
};

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
      if (String(r.section).toLowerCase() !== 'crypto') continue;
      const pos = parseCryptoPosition(typeof r.subText === 'string' ? r.subText : null);
      if (pos && !historyCoversPosition(cryptoHistory, pos.symbol)) return null;
    }
  }

  let uah = 0;
  let pln = 0;

  for (const r of accounts) {
    const section = String(r.section ?? '').trim().toLowerCase();
    const primaryCurrency = r.primaryCurrency === 'PLN' ? 'PLN' : 'UAH';
    const key = String(r.accountKey ?? '').trim().toLowerCase();
    const baseAmount = Number(r.primaryAmount);
    if (!Number.isFinite(baseAmount)) continue;

    let amountPrimary: number;
    if (section === 'crypto') {
      const pos = parseCryptoPosition(typeof r.subText === 'string' ? r.subText : null);
      if (pos && cryptoHistory && historyCoversPosition(cryptoHistory, pos.symbol)) {
        const usdAtMonthStart = pos.amount * (cryptoHistory.pricesMonthStart[pos.symbol] as number);
        amountPrimary = convertAmount(usdAtMonthStart, 'USD', primaryCurrency);
      } else {
        const delta = sumAccountDeltasSinceMonthStart(transactions, key, now);
        amountPrimary = baseAmount - delta;
      }
    } else {
      const delta = sumAccountDeltasSinceMonthStart(transactions, key, now);
      amountPrimary = baseAmount - delta;
    }

    const signedAmountPrimary = section === 'debt' && r.debtDirection === 'owed_by_me' ? -amountPrimary : amountPrimary;
    if (primaryCurrency === 'PLN') pln += signedAmountPrimary;
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
