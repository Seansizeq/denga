/**
 * Server-side mirror of src/utils/denomination.ts.
 *
 * A denomination is the unit an account balance or transaction amount is
 * counted in: a fiat currency settled through FX rates, or a crypto asset
 * priced in USD. Keep the two files in sync — the transfer rules depend on both
 * sides agreeing on what a stored `currency` value means.
 */

export const CRYPTO_DENOMINATIONS = ['BTC', 'ETH', 'SOL', 'TON', 'USDT'];
export const FIAT_DENOMINATIONS = ['UAH', 'PLN', 'USD'];
export const DENOMINATIONS = [...FIAT_DENOMINATIONS, ...CRYPTO_DENOMINATIONS];

export const isCryptoDenomination = (value) =>
  CRYPTO_DENOMINATIONS.includes(String(value ?? '').trim().toUpperCase());

export const isFiatDenomination = (value) =>
  FIAT_DENOMINATIONS.includes(String(value ?? '').trim().toUpperCase());

/**
 * Keeps crypto codes intact, unlike normalizeCurrency which collapses anything
 * unknown to UAH. Use this for stored account/transaction units.
 */
export const normalizeDenomination = (raw) => {
  const code = String(raw ?? '').trim().toUpperCase();
  return DENOMINATIONS.includes(code) ? code : 'UAH';
};

export const denominationPrecision = (denomination) => {
  const code = normalizeDenomination(denomination);
  if (!isCryptoDenomination(code)) return 2;
  if (code === 'USDT') return 2;
  if (code === 'BTC') return 8;
  return 6;
};

const cryptoUsdPrice = (symbol, cryptoUsd) => {
  const price = cryptoUsd?.[symbol];
  return Number.isFinite(price) && price > 0 ? price : null;
};

/**
 * Converts between any two denominations via USD.
 *
 * Returns null when a crypto price is missing so callers can omit the figure
 * instead of reporting a wrong one.
 */
export const convertDenomination = (amount, from, to, { fx, cryptoUsd, convertFiat } = {}) => {
  if (!Number.isFinite(amount)) return null;
  const fromCode = normalizeDenomination(from);
  const toCode = normalizeDenomination(to);
  if (fromCode === toCode) return amount;
  if (typeof convertFiat !== 'function') return null;

  let usdAmount;
  if (isCryptoDenomination(fromCode)) {
    const price = cryptoUsdPrice(fromCode, cryptoUsd);
    if (price === null) return null;
    usdAmount = amount * price;
  } else {
    usdAmount = convertFiat(amount, fromCode, 'USD', fx);
  }

  if (isCryptoDenomination(toCode)) {
    const price = cryptoUsdPrice(toCode, cryptoUsd);
    if (price === null) return null;
    return usdAmount / price;
  }
  return convertFiat(usdAmount, 'USD', toCode, fx);
};

const LEGACY_POSITION_RE = new RegExp(
  '([0-9][0-9\\s\\u00A0\\u202F]*(?:[.,][0-9]+)?)\\s*([A-Za-z]{3,5})'
);
const LEGACY_SPACE_RE = new RegExp('[\\s\\u00A0\\u202F]+', 'g');

/**
 * Parses a legacy free-text crypto position such as "0,45 ETH".
 * Only used by the one-off migration that moves those strings into real
 * numeric balances.
 */
export const parseLegacyCryptoPosition = (subText) => {
  if (typeof subText !== 'string' || !subText.trim()) return null;
  const m = subText.match(LEGACY_POSITION_RE);
  if (!m?.[1] || !m?.[2]) return null;
  const amount = Number(m[1].replace(LEGACY_SPACE_RE, '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const symbol = m[2].toUpperCase();
  return CRYPTO_DENOMINATIONS.includes(symbol) ? { symbol, amount } : null;
};
