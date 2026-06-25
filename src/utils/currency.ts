export type FiatCurrencyCode = 'UAH' | 'PLN' | 'USD';
export type CurrencyCode = FiatCurrencyCode | 'USDT' | 'BTC' | 'ETH';

export type FxRatesPayload = {
  base: FiatCurrencyCode;
  rates: Record<FiatCurrencyCode, number>;
  updatedAt: string;
  source: 'live' | 'fallback' | 'cache';
};

export const SUPPORTED_CURRENCIES: FiatCurrencyCode[] = ['UAH', 'PLN', 'USD'];
export const TRANSFER_FROM_CURRENCIES: CurrencyCode[] = ['UAH', 'PLN', 'USD', 'USDT', 'BTC', 'ETH'];

export const normalizeCurrency = (raw?: string | null): FiatCurrencyCode => {
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
