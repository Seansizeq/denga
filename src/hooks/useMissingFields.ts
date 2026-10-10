import { useCallback, useMemo } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { getMissingFields, type MissingFields } from '../utils/transactionCompleteness';

/**
 * Перевірка «чого бракує операції» з урахуванням рахунків людини.
 *
 * Поки рахунки не прийшли, рахунок не вимагаємо: інакше на мить позначеною
 * блимала б уся історія. Рахунок цілі не рахується — з нього не платять.
 */
export const useMissingFields = () => {
  const { accounts, accountsLoaded } = usePortfolio();

  const hasAccounts = useMemo(
    () =>
      accountsLoaded &&
      accounts.some((row) => {
        if (!row || typeof row !== 'object') return false;
        const r = row as Record<string, unknown>;
        return String(r.accountKey ?? '').trim() !== '' && String(r.section ?? '').trim() !== 'goal';
      }),
    [accounts, accountsLoaded],
  );

  return useCallback(
    (tx: Parameters<typeof getMissingFields>[0]): MissingFields => getMissingFields(tx, { hasAccounts }),
    [hasAccounts],
  );
};
