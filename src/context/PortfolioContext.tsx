import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { apiFetch } from '../api/client';
import { usePersistedState } from '../hooks/usePersistedState';
import { usePolling } from '../hooks/usePolling';
import { useSync } from './SyncContext';
import type { RawAccount } from './SyncContext';
import type { CryptoUsdHistory } from '../utils/portfolioMonthChange';

/**
 * Гаманець: рахунки й ціни на крипту.
 *
 * Рахунки приходять зі спільного знімка разом із транзакціями — раніше це був
 * окремий опитувач із власним тактом на ті самі пʼять секунд. Ціни лишилися
 * тут: у них свій ритм (дві хвилини й півгодини) і власні маршрути, тож
 * зводити їх у знімок не було б чим виправдати.
 */

const CRYPTO_PRICES_STORAGE_KEY = 'denga_crypto_prices_v1';
const CRYPTO_HISTORY_STORAGE_KEY = 'denga_crypto_history_v2';

const CRYPTO_PRICES_POLL_MS = 120_000;
const CRYPTO_HISTORY_POLL_MS = 30 * 60 * 1000;

export type { RawAccount };
export type CryptoPrices = Record<string, number>;

const isCryptoPrices = (v: unknown): v is CryptoPrices => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every((n) => typeof n === 'number');
};

const isCryptoHistory = (v: unknown): v is CryptoUsdHistory => {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return (
    obj.pricesNow !== undefined &&
    obj.pricesMonthStart !== undefined &&
    typeof obj.pricesNow === 'object' &&
    typeof obj.pricesMonthStart === 'object'
  );
};

interface PortfolioContextValue {
  accounts: RawAccount[];
  /** true — останній запит рахунків не вдався, на екрані кешовані суми. */
  accountsStale: boolean;
  /** false, поки не завершився перший запит: «рахунків немає» ≠ «ще вантажимо». */
  accountsLoaded: boolean;
  cryptoPrices: CryptoPrices;
  cryptoUsdHistory: CryptoUsdHistory | null;
  refreshAccounts: () => Promise<void>;
  refreshCryptoPrices: () => Promise<void>;
  refreshCryptoHistory: () => Promise<void>;
}

const PortfolioContext = createContext<PortfolioContextValue | undefined>(undefined);

export const PortfolioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { accounts, stale: accountsStale, loaded: accountsLoaded, refresh: refreshAccounts } = useSync();

  const [cryptoPrices, setCryptoPrices] = usePersistedState<CryptoPrices>(
    CRYPTO_PRICES_STORAGE_KEY,
    {},
    { validate: isCryptoPrices },
  );
  const [cryptoUsdHistory, setCryptoUsdHistory] = usePersistedState<CryptoUsdHistory | null>(
    CRYPTO_HISTORY_STORAGE_KEY,
    null,
    {
      validate: (v: unknown): v is CryptoUsdHistory | null => v === null || isCryptoHistory(v),
    },
  );

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshCryptoPrices = useCallback(async () => {
    try {
      const res = await apiFetch('/api/crypto-prices');
      if (!res.ok) return;
      const data = await res.json();
      const prices = (data?.prices ?? {}) as Record<string, unknown>;
      const normalized: CryptoPrices = {};
      for (const [k, v] of Object.entries(prices)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) normalized[k.toUpperCase()] = n;
      }
      if (mountedRef.current) setCryptoPrices(normalized);
    } catch {
      /* keep previous cached value */
    }
  }, [setCryptoPrices]);

  const refreshCryptoHistory = useCallback(async () => {
    try {
      const res = await apiFetch('/api/crypto-prices-history');
      if (!res.ok) return;
      const body = (await res.json()) as {
        ok?: boolean;
        pricesMonthStart?: Record<string, number>;
        pricesNow?: Record<string, number>;
      };
      if (!body?.ok || !body.pricesMonthStart || !body.pricesNow) return;
      const next: CryptoUsdHistory = {
        pricesMonthStart: body.pricesMonthStart as CryptoUsdHistory['pricesMonthStart'],
        pricesNow: body.pricesNow as CryptoUsdHistory['pricesNow'],
      };
      if (mountedRef.current) setCryptoUsdHistory(next);
    } catch {
      /* keep previous cached value */
    }
  }, [setCryptoUsdHistory]);

  usePolling(refreshCryptoPrices, CRYPTO_PRICES_POLL_MS);
  usePolling(refreshCryptoHistory, CRYPTO_HISTORY_POLL_MS);

  const value = useMemo<PortfolioContextValue>(
    () => ({
      accounts,
      accountsStale,
      accountsLoaded,
      cryptoPrices,
      cryptoUsdHistory,
      refreshAccounts,
      refreshCryptoPrices,
      refreshCryptoHistory,
    }),
    [
      accounts,
      accountsStale,
      accountsLoaded,
      cryptoPrices,
      cryptoUsdHistory,
      refreshAccounts,
      refreshCryptoPrices,
      refreshCryptoHistory,
    ],
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
};

export const usePortfolio = (): PortfolioContextValue => {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used within a PortfolioProvider');
  return ctx;
};
