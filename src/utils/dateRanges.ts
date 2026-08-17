export const isWithinLastDays = (isoDate: string, days: number, now = new Date()): boolean => {
  const date = new Date(isoDate);
  const diff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
};

/**
 * Календарна дата так, як її бачить користувач. `toISOString()` дає день за UTC,
 * тож на схід від Гринвіча кілька перших годин доби припадають ще на «вчора»:
 * внесок о 01:00 у Києві записувався попереднім днем.
 */
export const localIsoDate = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const buildPastDays = (count: number, now = new Date()): string[] =>
  Array.from({ length: count }, (_, idx) => {
    const d = new Date(now);
    d.setDate(now.getDate() - idx);
    return localIsoDate(d);
  });
