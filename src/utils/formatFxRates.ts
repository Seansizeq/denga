import type { CurrencyCode, FxRatesPayload } from './currency';
import { convertCurrency, SUPPORTED_CURRENCIES } from './currency';

const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  UAH: '\u20b4',
  PLN: 'z\u0142',
  USD: '$',
};

export type FxSummaryLine = {
  from: CurrencyCode;
  to: CurrencyCode;
  lead: string;
  rate: string;
};

const formatRate = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '\u2014';
  const decimals = value >= 100 ? 1 : value >= 10 ? 2 : value >= 1 ? 3 : 4;
  return value.toFixed(decimals);
};

export const formatFxSummary = (
  fx: FxRatesPayload,
  displayCurrency: CurrencyCode,
): FxSummaryLine[] =>
  SUPPORTED_CURRENCIES.filter((code) => code !== displayCurrency).map((from) => {
    const rate = convertCurrency(1, from, displayCurrency, fx);
    return {
      from,
      to: displayCurrency,
      lead: `1 ${from}`,
      rate: `${formatRate(rate)} ${CURRENCY_SYMBOL[displayCurrency]}`,
    };
  });

export const formatFxUpdatedAt = (fx: FxRatesPayload, locale: string): string => {
  const ts = new Date(fx.updatedAt).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return '\u2014';
  return new Date(ts).toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};
