import { useCallback, useMemo } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { useTranslation } from '../i18n/LanguageContext';
import {
  convertDenomination,
  denominationRate,
  type CryptoUsdPrices,
  type Denomination,
  type DenominationRates,
} from '../utils/denomination';

/**
 * Joins the two halves of the app's pricing: fiat FX lives in LanguageContext,
 * crypto USD prices live in PortfolioContext. Anything that needs to value an
 * account or amount should convert through here rather than reaching for one
 * source and assuming the other.
 */
export const useDenominationRates = () => {
  const { fxRates, displayCurrency } = useTranslation();
  const { cryptoPrices } = usePortfolio();

  const rates = useMemo<DenominationRates>(
    () => ({ fx: fxRates, cryptoUsd: cryptoPrices as CryptoUsdPrices }),
    [fxRates, cryptoPrices],
  );

  /** Returns null when a crypto price is missing, so callers can render "—". */
  const convert = useCallback(
    (amount: number, from: Denomination, to?: Denomination): number | null =>
      convertDenomination(amount, from, to ?? (displayCurrency as Denomination), rates),
    [rates, displayCurrency],
  );

  const rateBetween = useCallback(
    (from: Denomination, to: Denomination): number | null => denominationRate(from, to, rates),
    [rates],
  );

  return { rates, convert, rateBetween };
};
