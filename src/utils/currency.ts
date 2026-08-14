export type CurrencyCode = 'UAH' | 'PLN' | 'USD';

export type FxRatesPayload = {
  base: CurrencyCode;
  rates: Record<CurrencyCode, number>;
  updatedAt: string;
  source: 'live' | 'fallback' | 'cache';
};

export const SUPPORTED_CURRENCIES: CurrencyCode[] = ['UAH', 'PLN', 'USD'];

/**
 * Fiat reporting currency. Collapses anything else to UAH, so never use it on a
 * stored account balance or transaction amount — those are denominations and
 * may be crypto assets. See `normalizeDenomination` in ./denomination.
 */
export const normalizeCurrency = (raw?: string | null): CurrencyCode => {
  const code = String(raw ?? '').toUpperCase();
  return code === 'PLN' || code === 'USD' ? code : 'UAH';
};

export const fallbackRates: FxRatesPayload = {
  base: 'USD',
  rates: {
    USD: 1,
    PLN: 3.95,
    UAH: 39.0,
  },
  updatedAt: new Date(0).toISOString(),
  source: 'fallback',
};

export const convertCurrency = (
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  fx: FxRatesPayload | null | undefined
): number => {
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return amount;
  const rates = fx?.rates ?? fallbackRates.rates;
  const fromRate = rates[from] ?? fallbackRates.rates[from];
  const toRate = rates[to] ?? fallbackRates.rates[to];
  if (!Number.isFinite(fromRate) || fromRate <= 0 || !Number.isFinite(toRate) || toRate <= 0) {
    return amount;
  }
  const usdAmount = amount / fromRate;
  return usdAmount * toRate;
};
