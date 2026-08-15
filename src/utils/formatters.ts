import { denominationPrecision, isCryptoDenomination, type Denomination } from './denomination';
import { MONEY_MASK, isMoneyHidden } from './moneyPrivacy';

export type PlannerCurrency = 'UAH' | 'PLN';
export type DisplayCurrency = PlannerCurrency | 'USD';

/**
 * Саме число суми — або крапки, якщо увімкнено «приховати баланс».
 * Символ валюти лишається на місці, щоб верстка не стрибала при перемиканні.
 */
const amountBody = (amount: number, locale: string, maximumFractionDigits: number): string => {
  if (isMoneyHidden()) return MONEY_MASK;
  return Math.abs(amount).toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
};

export const formatPlannerMoney = (amount: number, locale: string, currency: PlannerCurrency): string => {
  const formatted = amountBody(amount, locale, 2);
  return currency === 'PLN' ? `${formatted} zł` : `${formatted} ₴`;
};

/**
 * Formats an amount in its own denomination. Crypto assets get a trailing
 * symbol and enough decimals that a small position does not round to zero.
 */
export const formatCurrency = (
  amount: number,
  locale = 'uk-UA',
  currency: Denomination = 'UAH'
): string => {
  const formatted = amountBody(amount, locale, denominationPrecision(currency));
  if (currency === 'PLN') return `${formatted} zł`;
  if (currency === 'USD') return `$${formatted}`;
  if (isCryptoDenomination(currency)) return `${formatted} ${currency}`;
  return `${formatted} ₴`;
};

export const formatSignedCurrency = (
  amount: number,
  locale = 'uk-UA',
  currency: DisplayCurrency = 'UAH'
): string => {
  // Знак теж ховаємо: «−•••• ₴» видало б, що баланс у мінусі.
  const sign = !isMoneyHidden() && amount < 0 ? '-' : '';
  return sign + formatCurrency(amount, locale, currency);
};

export const formatDate = (date: string, locale = 'uk-UA'): string => {
  return new Date(date).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  });
};

export const formatFullDateTime = (date: string, locale = 'uk-UA'): string => {
  return new Date(date).toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const isSameMonth = (iso: string, ref: Date = new Date()): boolean => {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
};

export const getIsoWeekRange = (ref: Date = new Date()): { start: Date; end: Date } => {
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offsetToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export const isInIsoWeek = (iso: string, ref: Date = new Date()): boolean => {
  const { start, end } = getIsoWeekRange(ref);
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
};
