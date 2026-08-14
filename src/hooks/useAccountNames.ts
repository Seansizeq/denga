import { useCallback } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { formatAccountLabel } from '../utils/transactionAccount';

/**
 * Назва рахунку така, як у гаманці. Якщо ключа в портфелі немає (стара
 * транзакція з видаленим рахунком) — акуратно розкладений ключ, щоб рядок
 * не залишився порожнім.
 */
export const useAccountNames = () => {
  const { accounts } = usePortfolio();

  return useCallback(
    (accountKey?: string | null): string => {
      const key = String(accountKey ?? '').trim().toLowerCase();
      if (!key) return '';
      for (const row of accounts) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        if (String(r.accountKey ?? '').trim().toLowerCase() !== key) continue;
        const name = String(r.name ?? '').trim();
        if (name) return name;
        break;
      }
      return formatAccountLabel(key);
    },
    [accounts],
  );
};
