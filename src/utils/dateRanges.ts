export const isWithinLastDays = (isoDate: string, days: number, now = new Date()): boolean => {
  const date = new Date(isoDate);
  const diff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
};

export const buildPastDays = (count: number, now = new Date()): string[] =>
  Array.from({ length: count }, (_, idx) => {
    const d = new Date(now);
    d.setDate(now.getDate() - idx);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
