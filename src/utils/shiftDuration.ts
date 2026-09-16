/**
 * Тривалість зміни на боці застосунку.
 *
 * Дзеркало правил із `server/planner-shift.js`: сервер однаково перерахує все
 * сам, але форма має показати тривалість одразу, поки людина рухає стрілки, —
 * інакше про нічну зміну вона дізнається лише після збереження.
 *
 * Тримати обидва місця в згоді обовʼязково. Розбіжність тут не впаде помилкою,
 * а тихо покаже одне число й запише інше.
 */

/** Доба — межа, за якою будь-яке число вже помилка вводу (MAX_SHIFT_HOURS). */
export const MAX_SHIFT_HOURS = 24;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const minutesOfDay = (raw: string): number | null => {
  const match = TIME_RE.exec(String(raw ?? '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

/**
 * Скільки тривала зміна від початку до кінця.
 *
 * Кінець раніше за початок — нічна зміна, а не помилка. Однаковий час —
 * навпаки: це незаповнене поле, і 24 години з нього робити не можна.
 */
export const hoursFromTimeRange = (startTime: string, endTime: string): number | null => {
  const start = minutesOfDay(startTime);
  const end = minutesOfDay(endTime);
  if (start === null || end === null) return null;
  if (start === end) return null;
  const span = end > start ? end - start : end + 24 * 60 - start;
  return Number((span / 60).toFixed(4));
};

/** «8 год 30 хв» — підписи приходять із перекладу, а не зашиті тут. */
export const formatHoursMinutes = (
  decimalHours: number,
  unitLabels: { hours: string; minutes: string },
): string => {
  const total = Math.max(0, Number(decimalHours) || 0);
  const totalMinutes = Math.round(total * 60);
  let hours = Math.floor(totalMinutes / 60);
  let minutes = totalMinutes - hours * 60;
  if (minutes === 60) {
    hours += 1;
    minutes = 0;
  }
  if (hours === 0 && minutes === 0) return `0${unitLabels.hours}`;
  if (hours === 0) return `${minutes}${unitLabels.minutes}`;
  if (minutes === 0) return `${hours}${unitLabels.hours}`;
  return `${hours}${unitLabels.hours} ${minutes}${unitLabels.minutes}`;
};

/** Проміжок у рядок для списку змін: «09:00 – 17:30». Порожньо, коли часу немає. */
export const formatTimeRange = (startTime: string, endTime: string): string => {
  if (minutesOfDay(startTime) === null || minutesOfDay(endTime) === null) return '';
  return `${startTime} – ${endTime}`;
};
