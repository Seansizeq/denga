/**
 * Вибір адресатів для хвилинного такту розсилки.
 *
 * Такт колись перебирав усіх користувачів і для кожного ходив у базу за
 * налаштуваннями та нагадуваннями — чотири звернення на людину щохвилини, одне
 * з них на запис. Ціна такого перебору росте разом із базою, а корисної роботи
 * в ньому рівно стільки, скільки людей мають подію саме в цю хвилину.
 *
 * Тому такт спершу питає, котра зараз година в кожному часовому поясі бази
 * (поясів одиниці), а тоді одним запитом бере рядки, чий час збігається хоч з
 * одним із цих значень. Збіг із чужим поясом відсіює вже JS: у рядка є власник,
 * у власника — свій пояс.
 */

/** Пояс у базі може бути NULL, порожнім рядком або текстом — ключ має бути один. */
export const zoneKey = (rawZone) => (rawZone === null || rawZone === undefined ? '' : String(rawZone));

/**
 * Локальний час для кожного сирого значення пояса, що трапляється в базі.
 *
 * `resolveClock` повертає `{ day, time, weekday }` — обчислення дати винесене
 * назовні, щоб тут не було ні `Intl`, ні поточного моменту.
 *
 * @param {Array<string | null | undefined>} rawZones
 * @param {(rawZone: string | null | undefined) => { day: string, time: string, weekday: string } | null} resolveClock
 * @returns {Map<string, { day: string, time: string, weekday: string }>}
 */
export const buildZoneClocks = (rawZones, resolveClock) => {
  const clocks = new Map();
  for (const rawZone of rawZones || []) {
    const key = zoneKey(rawZone);
    if (clocks.has(key)) continue;
    const clock = resolveClock(rawZone);
    if (!clock?.day || !clock?.time) continue;
    clocks.set(key, clock);
  }
  return clocks;
};

/**
 * Множина «HH:MM», що настали хоч у якомусь поясі. Саме вона йде в SQL як
 * список значень — без неї довелося б читати всі нагадування.
 */
export const collectDueTimes = (clocks) => {
  const times = new Set();
  for (const clock of clocks.values()) {
    if (clock?.time) times.add(clock.time);
  }
  return Array.from(times).sort();
};

export const clockForZone = (clocks, rawZone) => clocks.get(zoneKey(rawZone)) ?? null;

/**
 * Які саме звіти настали для цього користувача.
 *
 * Тижневий — лише в понеділок, місячний — лише першого числа, і обидва лише о
 * власній годині відправлення. Порожній масив означає, що рядок потрапив у
 * вибірку через чужий пояс або чужу хвилину.
 */
export const dueReportTypes = (clock, settings) => {
  if (!clock?.time || !settings) return [];
  if (clock.time !== settings.sendTime) return [];
  const due = [];
  if (settings.autoWeekly && clock.weekday === 'mon') due.push('weekly');
  if (settings.autoMonthly && String(clock.day).endsWith('-01')) due.push('monthly');
  return due;
};

/** Нагадування настало, якщо його час дорівнює локальному часу власника. */
export const isReminderDue = (clock, reminder) =>
  Boolean(clock?.time) && Boolean(reminder?.enabled) && clock.time === reminder?.timeHHMM;

const placeholders = (values) => values.map(() => '?').join(', ');

/**
 * Обидва запити починаються з таблиці налаштувань, а не з `users`: рядків на
 * конкретну хвилину одиниці, і за індексом вони знаходяться одразу, тоді як
 * обхід користувачів коштував би стільки, скільки їх у базі.
 *
 * `user_id` там текстовий, а `telegram_id` — цілий; `CAST` лишає з'єднання на
 * первинному ключі `users` замість порівняння різних типів.
 */
export const dueReportsQuery = (dueTimes) => ({
  sql: `SELECT u.telegram_id AS telegramId, u.chat_id AS chatId, u.timezone AS timezone,
               s.auto_weekly AS autoWeekly, s.auto_monthly AS autoMonthly, s.send_time AS sendTime
        FROM bot_report_settings s
        JOIN users u ON u.telegram_id = CAST(s.user_id AS INTEGER)
        WHERE s.send_time IN (${placeholders(dueTimes)})
          AND (s.auto_weekly = 1 OR s.auto_monthly = 1)
        ORDER BY u.telegram_id ASC`,
  params: [...dueTimes],
});

export const dueRemindersQuery = (dueTimes) => ({
  sql: `SELECT r.id AS id, r.kind AS kind, r.title AS title,
               r.time_hhmm AS timeHHMM, r.lead_days AS leadDays,
               u.telegram_id AS telegramId, u.chat_id AS chatId, u.timezone AS timezone
        FROM user_reminders r
        JOIN users u ON u.telegram_id = CAST(r.user_id AS INTEGER)
        WHERE r.enabled = 1
          AND r.time_hhmm IN (${placeholders(dueTimes)})
        ORDER BY u.telegram_id ASC, r.kind ASC`,
  params: [...dueTimes],
});
