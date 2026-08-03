export const shiftReportIsoDay = (day, deltaDays) => {
  const date = new Date(`${day}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return day;
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
};

/** The last fully completed Monday–Sunday period before the supplied day. */
export const getPreviousFullWeekDaySet = (todayDay) => {
  const date = new Date(`${todayDay}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return new Set([todayDay]);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  const currentMonday = shiftReportIsoDay(todayDay, -daysSinceMonday);
  const previousMonday = shiftReportIsoDay(currentMonday, -7);
  const set = new Set();
  for (let index = 0; index < 7; index += 1) {
    set.add(shiftReportIsoDay(previousMonday, index));
  }
  return set;
};
