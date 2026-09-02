import type { TransactionType } from '../types';

const STORAGE_KEY = 'add_tx_defaults_v1';

/**
 * The unit is deliberately absent: it follows the payment account, and where no
 * account is chosen it follows the app's own currency. Remembering the last one
 * here would only shadow both.
 */
export interface AddTransactionDefaults {
  type?: TransactionType;
  categoryId?: string;
  paymentAccount?: string;
}

export function loadAddTransactionDefaults(): AddTransactionDefaults | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AddTransactionDefaults;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAddTransactionDefaults(defaults: AddTransactionDefaults): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch {
    // ignore quota errors
  }
}

export function hasPrefillParams(searchParams: URLSearchParams, isEditing: boolean): boolean {
  if (isEditing) return true;
  const keys = ['amount', 'currency', 'categoryId', 'date', 'note', 'account', 'type'];
  return keys.some((k) => {
    const v = searchParams.get(k);
    return v != null && v.trim() !== '';
  });
}
