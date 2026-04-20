export const formatCurrency = (amount: number): string => {
  return amount.toLocaleString('uk-UA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }) + ' ₴';
};

export const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const formatFullDateTime = (date: string): string => {
  return new Date(date).toLocaleString('uk-UA');
};
