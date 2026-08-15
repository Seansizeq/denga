import { convertCurrency, type CurrencyCode, type FxRatesPayload } from './currency';
import { MONEY_MASK, isMoneyHidden } from './moneyPrivacy';

/**
 * A denomination is the unit an account balance or a transaction amount is
 * counted in. Fiat denominations are settled through FX rates; crypto ones are
 * priced in USD and then converted onward.
 *
 * Before this existed the app had two parallel truths for a crypto account: a
 * fiat number in `primary_amount` and a free-text position ("120 USDT") in
 * `sub_text`. Transfers moved the first, the UI displayed the second.
 */
export type CryptoSymbol = 'BTC' | 'ETH' | 'SOL' | 'TON' | 'USDT';
export type Denomination = CurrencyCode | CryptoSymbol;

export const CRYPTO_DENOMINATIONS: readonly CryptoSymbol[] = ['BTC', 'ETH', 'SOL', 'TON', 'USDT'];
export const FIAT_DENOMINATIONS: readonly CurrencyCode[] = ['UAH', 'PLN', 'USD'];
export const DENOMINATIONS: readonly Denomination[] = [...FIAT_DENOMINATIONS, ...CRYPTO_DENOMINATIONS];

export type CryptoUsdPrices = Partial<Record<CryptoSymbol, number>>;

export const isCryptoDenomination = (value: unknown): value is CryptoSymbol =>
  (CRYPTO_DENOMINATIONS as readonly string[]).includes(String(value ?? '').toUpperCase());

export const isFiatDenomination = (value: unknown): value is CurrencyCode =>
  (FIAT_DENOMINATIONS as readonly string[]).includes(String(value ?? '').toUpperCase());

/**
 * Unlike `normalizeCurrency`, this keeps crypto codes intact. Use it wherever a
 * stored account/transaction unit is read; use `normalizeCurrency` only where a
 * fiat reporting currency is genuinely required.
 */
export const normalizeDenomination = (raw?: string | null): Denomination => {
  const code = String(raw ?? '').trim().toUpperCase();
  return (DENOMINATIONS as readonly string[]).includes(code) ? (code as Denomination) : 'UAH';
};

/** How many decimals make sense when showing an amount in this denomination. */
export const denominationPrecision = (denomination: Denomination): number => {
  if (!isCryptoDenomination(denomination)) return 2;
  if (denomination === 'USDT') return 2;
  if (denomination === 'BTC') return 8;
  return 6;
};

export const formatDenominationAmount = (amount: number, denomination: Denomination, locale = 'uk-UA'): string => {
  if (!Number.isFinite(amount)) return '—';
  const maximumFractionDigits = denominationPrecision(denomination);
  const formatted = isMoneyHidden()
    ? MONEY_MASK
    : amount.toLocaleString(locale, {
        minimumFractionDigits: isCryptoDenomination(denomination) ? 0 : 2,
        maximumFractionDigits,
      });
  return `${formatted} ${denomination}`;
};

export type DenominationRates = {
  fx: FxRatesPayload | null | undefined;
  cryptoUsd: CryptoUsdPrices | null | undefined;
};

const cryptoUsdPrice = (symbol: CryptoSymbol, cryptoUsd: CryptoUsdPrices | null | undefined): number | null => {
  const price = cryptoUsd?.[symbol];
  return Number.isFinite(price) && (price as number) > 0 ? (price as number) : null;
};

/**
 * Converts between any two denominations, routing crypto through USD.
 *
 * Returns `null` when a crypto price is unavailable rather than guessing — a
 * missing CoinGecko response must surface as "—", never as a wrong balance.
 */
export const convertDenomination = (
  amount: number,
  from: Denomination,
  to: Denomination,
  rates: DenominationRates,
): number | null => {
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;

  const { fx, cryptoUsd } = rates;

  let usdAmount: number;
  if (isCryptoDenomination(from)) {
    const price = cryptoUsdPrice(from, cryptoUsd);
    if (price === null) return null;
    usdAmount = amount * price;
  } else {
    usdAmount = convertCurrency(amount, from, 'USD', fx);
  }

  if (isCryptoDenomination(to)) {
    const price = cryptoUsdPrice(to, cryptoUsd);
    if (price === null) return null;
    return usdAmount / price;
  }
  return convertCurrency(usdAmount, 'USD', to, fx);
};

/**
 * Exchange rate for one unit of `from` expressed in `to`, used to pre-fill the
 * destination amount of a cross-denomination transfer.
 */
export const denominationRate = (
  from: Denomination,
  to: Denomination,
  rates: DenominationRates,
): number | null => {
  const converted = convertDenomination(1, from, to, rates);
  if (converted === null || !Number.isFinite(converted) || converted <= 0) return null;
  return converted;
};

/** Rounds a converted amount to something sane to show in an input field. */
export const roundForDenomination = (amount: number, denomination: Denomination): number => {
  if (!Number.isFinite(amount)) return 0;
  const factor = 10 ** denominationPrecision(denomination);
  return Math.round(amount * factor) / factor;
};
