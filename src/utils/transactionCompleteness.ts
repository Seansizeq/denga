import type { Transaction } from '../types';
import { CATEGORIES, getCustomCategoryData } from '../constants/categories';
import { getTransactionAccountKey } from './transactionAccount';
import { isBalanceCorrection } from './transactionUtils';

/** Чого бракує операції, щоб вона рахувалась як слід. */
export interface MissingFields {
  account: boolean;
  category: boolean;
}

/**
 * «Інше» — теж незаповнена категорія. Бот, банк і ярлики ставлять її саме
 * тоді, коли не вгадали, а відрізнити таке «Інше» від свідомо обраного нема
 * за чим. Мітка зникає, щойно обрано конкретну категорію.
 */
const PLACEHOLDER_CATEGORY_IDS = new Set(['other_expense', 'other_income']);

const isKnownCategory = (id: string): boolean =>
  CATEGORIES.some((c) => c.id === id) || getCustomCategoryData(id) !== null;

/**
 * Без рахунку операція не рухає жодного балансу: витрата є в історії й у
 * статистиці, а гроші на картці лишаються ті самі. Тому рахунок вимагаємо
 * лише тоді, коли людині є що обрати.
 */
export const getMissingFields = (
  tx: Pick<Transaction, 'type' | 'categoryId' | 'accountKey' | 'note' | 'fromAccountKey' | 'toAccountKey'>,
  options: { hasAccounts: boolean },
): MissingFields => {
  // Корекцію створює сам рахунок — заповнювати в ній нічого.
  if (isBalanceCorrection(tx)) return { account: false, category: false };
  if (tx.type === 'transfer') {
    return {
      account: options.hasAccounts && (!tx.fromAccountKey || !tx.toAccountKey),
      category: false,
    };
  }
  const categoryId = String(tx.categoryId ?? '').trim();
  return {
    account: options.hasAccounts && !getTransactionAccountKey(tx),
    category: !categoryId || PLACEHOLDER_CATEGORY_IDS.has(categoryId) || !isKnownCategory(categoryId),
  };
};

export const isIncomplete = (missing: MissingFields): boolean => missing.account || missing.category;
