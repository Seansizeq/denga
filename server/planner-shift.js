/**
 * Одна зміна: як її описує людина й що з цього лягає в базу.
 *
 * Досі опис зміни жив у двох несумісних формах. Календар писав у `planner_days`
 * — один рядок на день, у якому з усього опису лишалося число `workedHours`:
 * початок і кінець зникали при збереженні, а при наступному відкритті форма
 * вигадувала їх заново («завжди 09:00, кінець = 09:00 + години»). Бот писав у
 * `planner_shift_entries` — скільки завгодно змін на день і зі справжнім часом.
 * Читання брало або одне, або інше, тож ручна зміна на дні, де бот запустив
 * свою, тихо зникала з усіх підсумків.
 *
 * Тепер форма одна, і вона описує **зміну**, а не день. Цей модуль — її
 * правила, окремо від маршрутів: тут немає ні бази, ні express, тож перевірити
 * їх можна на прикладах, а не на живому сервері.
 */

/**
 * Стеля тривалості.
 *
 * Не педантизм: поле годин приймало будь-яке число, а клавіатура на телефоні
 * не дає набрати двокрапку, тож «8:30» люди набирали як «830» — і в базу йшло
 * вісімсот тридцять годин, помножених на ставку. Доба — межа, за якою будь-яке
 * число вже помилка вводу, а не довга зміна.
 */
export const MAX_SHIFT_HOURS = 24;

/**
 * Звідки взялася тривалість.
 *
 * `range` — людина назвала початок і кінець, години рахуються з них.
 * `hours` — часу немає (зміна з шаблону «8 годин», перенесений старий запис),
 *   тривалість задана прямо.
 *
 * Це заміна прапорцю «Весь день», який означав рівно вісім годин і мовчки
 * привласнював собі будь-яку восьмигодинну зміну: варто було зберегти нічну
 * 22:00–06:00, і вона поверталася як «весь день, 09:00–17:00».
 */
export const SHIFT_MODES = ['range', 'hours'];

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** @returns 'HH:MM' або '' — щоб у базі не було «майже часу». */
export const normalizeTimeOfDay = (raw) => {
  const value = String(raw ?? '').trim();
  if (!TIME_RE.test(value)) return '';
  return value;
};

const minutesOfDay = (time) => {
  const match = TIME_RE.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

/**
 * Скільки тривала зміна від початку до кінця.
 *
 * Кінець раніше за початок означає нічну зміну — перехід через північ, а не
 * помилку. Однаковий час — навпаки: це не доба роботи, а незаповнене поле, і
 * мовчки записати 24 години було б гірше, ніж відмовити.
 *
 * @returns {number|null} години з точністю до хвилини, або null
 */
export const workedHoursFromRange = (startTime, endTime) => {
  const start = minutesOfDay(normalizeTimeOfDay(startTime));
  const end = minutesOfDay(normalizeTimeOfDay(endTime));
  if (start === null || end === null) return null;
  if (start === end) return null;
  const span = end > start ? end - start : end + 24 * 60 - start;
  return Number((span / 60).toFixed(4));
};

/** Години в межах доби; усе, що поза ними, — помилка вводу, а не зміна. */
export const clampWorkedHours = (raw) => {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Number(Math.min(MAX_SHIFT_HOURS, value).toFixed(4));
};

const readMode = (raw) => (SHIFT_MODES.includes(String(raw ?? '')) ? String(raw) : null);

const readMoney = (raw) => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : 0;
};

const readCurrency = (raw) => (String(raw ?? '').toUpperCase() === 'PLN' ? 'PLN' : 'UAH');

/** Підпис зміни — те саме «Назва • Символ», що вже лежить у нотатці дня. */
export const buildShiftNote = (name, symbol) =>
  [String(name ?? '').trim(), String(symbol ?? '').trim()].filter(Boolean).join(' • ').slice(0, 120);

/**
 * Перетворює те, що прийшло з форми, на рядок таблиці.
 *
 * @param body тіло запиту.
 * @param template шаблон, якщо зміну створюють з нього: він дає і час теж.
 *   Досі час шаблону ігнорувався — «Нічна 22:00–06:00» лягала як «зараз».
 * @param current наявний рядок при редагуванні: поля, яких немає в тілі,
 *   лишаються як були.
 * @returns {{ ok: true, value: object } | { ok: false, code: string, error: string }}
 */
export const normalizeShiftInput = ({ body = {}, template = null, current = null } = {}) => {
  const source = template ?? {};
  const fallbackMode = template
    ? (template.isFullDay ? 'hours' : 'range')
    : (current?.mode ?? 'range');

  const mode = readMode(body.mode) ?? fallbackMode;
  const startTime = normalizeTimeOfDay(
    body.startTime ?? source.startTime ?? current?.startTime ?? '',
  );
  const endTime = normalizeTimeOfDay(
    body.endTime ?? source.endTime ?? current?.endTime ?? '',
  );

  let workedHours;
  if (mode === 'range') {
    const fromRange = workedHoursFromRange(startTime, endTime);
    if (fromRange === null) {
      return {
        ok: false,
        code: 'INVALID_TIME_RANGE',
        error: 'потрібні початок і кінець зміни, і вони мають відрізнятися',
      };
    }
    workedHours = clampWorkedHours(fromRange);
  } else {
    const raw = body.workedHours ?? source.workedHours ?? current?.workedHours;
    workedHours = clampWorkedHours(raw);
    if (workedHours <= 0) {
      return { ok: false, code: 'INVALID_HOURS', error: `тривалість має бути від 0 до ${MAX_SHIFT_HOURS} годин` };
    }
  }

  const salaryRate = readMoney(body.salaryRate ?? source.salaryRate ?? current?.salaryRate);
  const salaryCurrency = readCurrency(
    body.salaryCurrency ?? source.salaryCurrency ?? current?.salaryCurrency,
  );
  let salaryAmount = readMoney(body.salaryAmount ?? source.salaryAmount ?? current?.salaryAmount);
  // Ставка × години — те, що людина інакше рахувала б на калькуляторі. Але
  // лише коли суми не назвали: названа сума завжди точніша за обчислену.
  if (salaryAmount <= 0 && salaryRate > 0) {
    salaryAmount = Number((salaryRate * workedHours).toFixed(2));
  }

  const note = typeof body.note === 'string'
    ? body.note.trim().slice(0, 120)
    : body.name !== undefined || body.symbol !== undefined
      ? buildShiftNote(body.name, body.symbol)
      : String(source.note ?? current?.note ?? '').trim().slice(0, 120);

  return {
    ok: true,
    value: {
      mode,
      // Час зберігається лише тоді, коли він щось означає: у режимі «годинами»
      // порожні поля чесніші за вигадані 09:00–17:00, які колись підставляла
      // форма.
      startTime: mode === 'range' ? startTime : '',
      endTime: mode === 'range' ? endTime : '',
      workedHours,
      salaryRate,
      salaryAmount,
      salaryCurrency,
      note,
    },
  };
};

/**
 * Мітки часу для сортування й для бота.
 *
 * Людина називає час свого годинника, а `started_at`/`ended_at` — це справжні
 * моменти в UTC: за ними впорядковується стрічка змін і рахує бот. Перетворює
 * їх `toUtcMs`, який передає викликач, бо потрібен пояс користувача.
 *
 * Нічна зміна закінчується наступного дня — інакше кінець виявився б раніше за
 * початок, і сортування поставило б її перед власним початком.
 *
 * @param toUtcMs (ymd, hours, minutes, seconds) => ms
 */
export const shiftInstants = ({ day, mode, startTime, endTime, toUtcMs, fallbackIso }) => {
  const fallback = fallbackIso ?? `${day}T12:00:00.000Z`;
  if (mode !== 'range' || typeof toUtcMs !== 'function') {
    return { startedAt: fallback, endedAt: fallback };
  }
  const start = minutesOfDay(normalizeTimeOfDay(startTime));
  const end = minutesOfDay(normalizeTimeOfDay(endTime));
  if (start === null || end === null) return { startedAt: fallback, endedAt: fallback };

  const startMs = toUtcMs(day, Math.floor(start / 60), start % 60, 0);
  if (!Number.isFinite(startMs)) return { startedAt: fallback, endedAt: fallback };
  const overnight = end <= start;
  const endMs = startMs + ((overnight ? end + 24 * 60 : end) - start) * 60_000;
  return {
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(endMs).toISOString(),
  };
};

/**
 * Підсумок дня з його змін.
 *
 * `planner_days` лишається, але тепер це **похідний** рядок: календар малює по
 * ньому крапку й символ, а числа в ньому — сума змін. Доки він був окремим
 * джерелом, дві половини системи писали в різні місця й показували різне.
 */
export const summarizeDayEntries = (entries = []) => {
  let workedHours = 0;
  let salaryAmountUah = 0;
  let salaryAmountPln = 0;
  let latestEndedAt = '';
  let latestNote = '';
  for (const entry of entries) {
    workedHours += clampWorkedHours(entry?.workedHours);
    const amount = readMoney(entry?.salaryAmount);
    if (readCurrency(entry?.salaryCurrency) === 'PLN') salaryAmountPln += amount;
    else salaryAmountUah += amount;
    const endedAt = String(entry?.endedAt ?? '');
    if (!latestEndedAt || endedAt > latestEndedAt) {
      latestEndedAt = endedAt;
      latestNote = String(entry?.note ?? '').trim();
    }
  }
  return {
    count: entries.length,
    workedHours: Number(workedHours.toFixed(4)),
    salaryAmountUah: Number(salaryAmountUah.toFixed(2)),
    salaryAmountPln: Number(salaryAmountPln.toFixed(2)),
    latestEndedAt,
    latestNote,
  };
};
