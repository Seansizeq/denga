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

/**
 * Межі для SQL-вибірки транзакцій за календарний місяць користувача.
 *
 * Місяць тут — **локальний**: чи належить транзакція вересню, вирішує дата в
 * поясі власника, а в базі лежить UTC. Тому точну перевірку («який це день у
 * поясі людини») однаково доводиться робити в JS.
 *
 * Але тягнути заради неї всю історію не треба. Ці межі відрізають надійний
 * надлишок: зсув поясу ніде не перевищує 14 годин, тож доба запасу з кожного
 * боку гарантує, що жоден рядок місяця не загубиться. Далі JS відсіює зайве
 * з країв.
 *
 * Порівняння рядкове, і це коректно: ISO-дата сортується лексикографічно так
 * само, як хронологічно, а `date` у базі — повний ISO (`2026-09-06T08:37:21Z`).
 *
 * @param {string} ym місяць у форматі `YYYY-MM`
 * @returns {{ from: string, to: string }} напіввідкритий проміжок `[from, to)`
 */
export const monthQueryBounds = (ym) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(ym ?? ''));
  if (!match) throw new Error(`monthQueryBounds: очікується YYYY-MM, отримано "${ym}"`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`monthQueryBounds: місяця "${ym}" не існує`);

  const firstDay = `${match[1]}-${match[2]}-01`;
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return {
    from: shiftReportIsoDay(firstDay, -2),
    to: shiftReportIsoDay(nextMonth, 2),
  };
};

/**
 * Межі SQL-вибірки, що накривають усі передані набори днів.
 *
 * Звіти й поради збирають кілька періодів одразу — сам період, попередній для
 * порівняння, іноді ще поточний місяць для бюджетів — і кожен із них це набір
 * **локальних** днів. Ця функція дає один проміжок, у якому всі вони
 * поміщаються, щоб замість `LIMIT 5000` по всій історії зробити один вузький
 * запит. Точну належність дня до періоду й далі вирішує JS: у базі UTC, а
 * періоди рахуються в поясі власника.
 *
 * Доба запасу з кожного боку — та сама причина, що в `monthQueryBounds`:
 * зсув поясу ніде не перевищує 14 годин.
 *
 * @param {...(Iterable<string>)} daySets набори днів `YYYY-MM-DD`
 * @returns {{ from: string, to: string } | null} `null`, якщо днів немає
 */
export const daySetQueryBounds = (...daySets) => {
  let min = null;
  let max = null;
  for (const set of daySets) {
    for (const raw of set ?? []) {
      const day = String(raw ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      if (min === null || day < min) min = day;
      if (max === null || day > max) max = day;
    }
  }
  if (min === null) return null;
  return {
    from: shiftReportIsoDay(min, -2),
    // Напіввідкритий проміжок: `to` має бути строго більшим за будь-яку мить
    // останнього дня, тож беремо наступний день плюс той самий запас.
    to: shiftReportIsoDay(max, 2),
  };
};
