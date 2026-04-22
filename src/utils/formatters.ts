export type PlannerCurrency = 'UAH' | 'PLN';

export const formatPlannerMoney = (amount: number, locale: string, currency: PlannerCurrency): string => {
  const formatted = Math.abs(amount).toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return currency === 'PLN' ? `${formatted} zł` : `${formatted} ₴`;
};

export const formatCurrency = (amount: number, locale = 'uk-UA'): string => {
  return formatPlannerMoney(amount, locale, 'UAH');
};

export const formatSignedCurrency = (amount: number, locale = 'uk-UA'): string => {
  const sign = amount < 0 ? '-' : '';
  return sign + formatCurrency(amount, locale);
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
