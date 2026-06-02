export type PlannerCurrency = 'UAH' | 'PLN';
export type DisplayCurrency = PlannerCurrency | 'USD';

export const formatPlannerMoney = (amount: number, locale: string, currency: PlannerCurrency): string => {
  const formatted = Math.abs(amount).toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return currency === 'PLN' ? `${formatted} zł` : `${formatted} ₴`;
};

export const formatCurrency = (
  amount: number,
  locale = 'uk-UA',
  currency: DisplayCurrency = 'UAH'
): string => {
  const formatted = Math.abs(amount).toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  if (currency === 'PLN') return `${formatted} zł`;
  if (currency === 'USD') return `$${formatted}`;
  return `${formatted} ₴`;
};

export const formatSignedCurrency = (
  amount: number,
  locale = 'uk-UA',
  currency: DisplayCurrency = 'UAH'
): string => {
  const sign = amount < 0 ? '-' : '';
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
