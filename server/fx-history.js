/**
 * Суми операції в трьох валютах звіту — за курсом **її** дня.
 *
 * Досі статистика перераховувала кожну операцію за сьогоднішнім курсом. Тож
 * підсумок вересня в злотих сьогодні був один, а через тиждень інший, хоча
 * ніхто нічого не міняв: гривнева покупка «дешевшала» разом із гривнею. Звіт
 * про минуле, що сам собою переписується, — не звіт.
 *
 * Тепер кожна операція раз і назавжди отримує `amountUah`, `amountPln`,
 * `amountUsd` за курсом дня, яким вона датована. Три, а не одна, бо валюту
 * показу можна перемикати, і перерахунок однієї збереженої суми в іншу
 * сьогоднішнім курсом повернув би ту саму проблему.
 *
 * Курс дня береться з `fx_daily`: сьогоднішній записується, щойно сервер
 * отримав свіжий курс, а минулі дні добираються з офіційного курсу НБУ —
 * єдиного безкоштовного джерела з історією гривні.
 */

export const REPORT_FIATS = ['UAH', 'PLN', 'USD'];

const roundMoney = (value) => Math.round(value * 100) / 100;

/**
 * Суми в UAH/PLN/USD за курсами одного дня.
 *
 * @param rates `{ usdUah, usdPln, crypto }` — гривень і злотих за долар, ціни
 *   крипти в доларах.
 * @returns `{ amountUah, amountPln, amountUsd }` або `null`, коли курсу немає
 *   (ціна монети на той день невідома) — краще без цифри, ніж вигадана.
 */
export const fiatAmountsAt = (amount, denomination, rates) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || !rates) return null;
  const usdUah = Number(rates.usdUah);
  const usdPln = Number(rates.usdPln);
  if (!(usdUah > 0) || !(usdPln > 0)) return null;

  const code = String(denomination ?? '').trim().toUpperCase();
  let usd;
  if (code === 'USD') usd = value;
  else if (code === 'UAH') usd = value / usdUah;
  else if (code === 'PLN') usd = value / usdPln;
  else {
    const price = Number(rates.crypto?.[code]);
    if (!(price > 0)) return null;
    usd = value * price;
  }

  // Сума у власній валюті операції лишається точно такою, як записана.
  return {
    amountUah: code === 'UAH' ? value : roundMoney(usd * usdUah),
    amountPln: code === 'PLN' ? value : roundMoney(usd * usdPln),
    amountUsd: code === 'USD' ? value : roundMoney(usd),
  };
};

/** Записана сума у валюті звіту, якщо вона є. */
export const stampedAmount = (tx, fiat) => {
  const field = { UAH: 'amountUah', PLN: 'amountPln', USD: 'amountUsd' }[String(fiat ?? '').toUpperCase()];
  const value = field ? Number(tx?.[field]) : NaN;
  return field && tx?.[field] !== null && tx?.[field] !== undefined && Number.isFinite(value) ? value : null;
};

export const nbuRatesUrl = (day) =>
  `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?date=${String(day).replaceAll('-', '')}&json`;

/**
 * Курс НБУ на день: гривень за долар і злотих за долар (через гривню).
 * @returns `{ usdUah, usdPln }` або `null`, якщо в відповіді немає потрібних пар.
 */
export const nbuDayRates = (payload) => {
  const rows = Array.isArray(payload) ? payload : [];
  const rate = (code) => Number(rows.find((row) => String(row?.cc ?? '').toUpperCase() === code)?.rate);
  const uahPerUsd = rate('USD');
  const uahPerPln = rate('PLN');
  if (!(uahPerUsd > 0) || !(uahPerPln > 0)) return null;
  return { usdUah: uahPerUsd, usdPln: uahPerUsd / uahPerPln };
};

/** День операції — дата з її мітки, як вона лежить у базі. */
export const transactionDay = (date) => {
  const day = String(date ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
};
