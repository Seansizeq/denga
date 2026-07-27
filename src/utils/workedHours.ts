export const formatWorkedHoursInput = (decimalHours: number): string => {
  const totalMinutes = Math.round(Math.max(0, Number(decimalHours) || 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
};

export const parseWorkedHoursInput = (raw: string): number | null => {
  const match = raw.trim().match(/^(\d+)(?:\s*[:.,]\s*(\d{1,2}))?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (!Number.isSafeInteger(hours) || minutes < 0 || minutes > 59) return null;

  return (hours * 60 + minutes) / 60;
};
