/**
 * Календар підписок: коли списання наступне і що робити з датою в минулому.
 *
 * Тут лише дати — без бази й без express, щоб правила можна було перевірити на
 * прикладах.
 */

export const toIsoDate = (d) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

/** `YYYY-MM-DD`, що справді існує в календарі, — інакше null (30 лютого не пройде). */
export const parseIsoDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (toIsoDate(d) !== value) return null;
  return d;
};

/** Плюс N місяців; день, якого в цільовому місяці немає, стає його останнім днем. */
export const addMonthsClamped = (date, months) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const first = new Date(Date.UTC(year, month + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first;
};

const monthsPerCycle = (cycle) => (cycle === 'yearly' ? 12 : 1);

export const addSubscriptionCycle = (date, cycle) => addMonthsClamped(date, monthsPerCycle(cycle));

/**
 * Найближча дата списання, не раніша за сьогодні.
 *
 * Автосписання доганяє всі пропущені цикли — і це правильно, коли сервер
 * лежав пару днів: гроші за ці дні справді пішли. Але так само воно поводилося
 * з датою, яка опинилась у минулому з волі людини: підписку, вимкнену в січні,
 * вмикали в червні — і отримували пʼять списань одним махом за місяці, коли
 * вона стояла на паузі. Те саме з новою підпискою, якій поставили дату з
 * минулого.
 *
 * Тому дату, яку людина щойно задала або з якою підписка щойно ожила,
 * пересуваємо вперед на цілі цикли — до першої, що не раніша за сьогодні.
 * Сьогоднішня лишається: списання сьогодні — чесне значення.
 *
 * Рахуємо від початкової дати, а не крок за кроком: 31 січня має давати
 * 31 березня, а не 28-ме, яке лишилося б після лютого.
 */
export const rollForwardChargeDate = (nextChargeDate, cycle, todayIso) => {
  const start = parseIsoDate(nextChargeDate);
  if (!start || !todayIso || nextChargeDate >= todayIso) return nextChargeDate;
  const step = monthsPerCycle(cycle);
  // Стеля — століття циклів: дата з 1900 року все одно знайде своє місце.
  for (let k = 1; k <= 1200; k += 1) {
    const candidate = toIsoDate(addMonthsClamped(start, step * k));
    if (candidate >= todayIso) return candidate;
  }
  return nextChargeDate;
};
