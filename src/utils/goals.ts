import { localIsoDate } from './dateRanges';

/** Скільки днів лишилося до дедлайну. Від'ємне — дедлайн уже минув. */
export const deadlineDeltaDays = (deadline: string | null, now: Date = new Date()): number | null => {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const [y, m, d] = deadline.split('-').map(Number);
  const end = new Date(y, m - 1, d);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
};

/** Прогрес для смужки — обрізаний сотнею, бо смужка не вміє бути довшою за себе. */
export const progressPct = (saved: number, target: number): number => {
  if (!target || target <= 0) return 0;
  return Math.min(100, (saved / target) * 100);
};

/** Реальний відсоток, включно з перевищенням цілі. Для чисел, а не для смужки. */
export const rawProgressPct = (saved: number, target: number): number => {
  if (!target || target <= 0) return 0;
  return Math.max(0, (saved / target) * 100);
};

/**
 * Колір заповнення смужки. Повертає CSS-змінні, а не хекси, щоб зміна палітри
 * лишалася в одному файлі — `variables.css`.
 */
export const fillColorForPct = (pct: number, goalColor: string): string => {
  if (pct >= 100) return 'var(--accent-yellow)';
  if (pct >= 50) return 'var(--accent-green)';
  return goalColor || 'var(--accent-primary)';
};

/** Внесок у тому вигляді, в якому темп цілі його потребує. */
export type PaceContribution = {
  date: string;
  amount: number;
  convertedAmount?: number;
};

export type GoalPhase = 'running' | 'done' | 'expired';

export type GoalPace = {
  phase: GoalPhase;
  /** Відсоток без обрізання сотнею. */
  rawPct: number;
  /** Скільки лишилося до цілі; нуль, якщо ціль узята. */
  remaining: number;
  /** Скільки днів лишилося до дедлайну; null — дедлайну немає. */
  daysLeft: number | null;
  /** Уся довжина забігу в днях; null — дедлайну немає. */
  totalDays: number | null;
  /** Днів від старту до внеску, що перетнув планку; null — ціль ще не взята. */
  reachedInDays: number | null;
  /** Денна норма, щоб дійти до цілі в дедлайн. */
  neededPerDay: number;
  /** Фактичний темп забігу — без стартової суми, її не заробляли за ці дні. */
  actualPerDay: number;
  /** Скільком перевищено ціль. */
  overachieved: number;
  /**
   * Дата, коли ціль закриється за поточним темпом (YYYY-MM-DD). null, якщо темпу
   * ще немає (нічого не внесено) або ціль уже взята — прогнозувати нічого.
   */
  forecastDate: string | null;
};

const amountOf = (c: PaceContribution): number =>
  Number.isFinite(c.convertedAmount) ? (c.convertedAmount as number) : c.amount;

/**
 * Темп і траєкторія цілі. Однакові для накопичення і для заробітку: різниця лише
 * в тому, звідки беруться внески, а не в тому, як рахується забіг.
 *
 * Стартова сума (`baseline`) — це гроші, які вже були до створення цілі. Вона
 * входить у прогрес і в план, але не у фактичний темп: її не заробляли протягом
 * цих днів, і без цього винятку темп першого ж дня вигляда б захмарним.
 */
export const computeGoalPace = ({
  saved,
  target,
  baseline = 0,
  createdAt,
  deadline,
  contributions = [],
  now = new Date(),
}: {
  saved: number;
  target: number;
  baseline?: number;
  createdAt: string;
  deadline: string | null;
  contributions?: PaceContribution[];
  now?: Date;
}): GoalPace => {
  const days = deadlineDeltaDays(deadline, now);
  const remaining = Math.max(0, target - saved);
  const rawPct = rawProgressPct(saved, target);
  const reached = target > 0 && saved >= target;
  const expired = !reached && days !== null && days < 0;
  const phase: GoalPhase = reached ? 'done' : expired ? 'expired' : 'running';

  const created = new Date(createdAt);
  created.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  // Забіг починається з першого внеску, якщо той старіший за саму ціль: гроші
  // можна відкласти, а ціль на них завести пізніше, вписавши внески заднім
  // числом. Без цього вікно спостереження стискалося до нуля днів, і темп
  // виходив таким, ніби все зібрано за сьогодні.
  let observedFrom = created;
  for (const c of contributions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) continue;
    const at = new Date(`${c.date}T00:00:00`);
    if (at.getTime() < observedFrom.getTime()) observedFrom = at;
  }
  const observedDays = Math.max(1, Math.round((today.getTime() - observedFrom.getTime()) / 86400000));
  const totalDays = deadline
    ? Math.max(1, Math.round((new Date(`${deadline}T00:00:00`).getTime() - created.getTime()) / 86400000))
    : null;

  // Скільки днів пішло на ціль: дата внеску, який перетнув планку. Сортування
  // за датою — внески одного дня між собою не важливі, планку перетинає сума.
  let reachedInDays: number | null = null;
  if (reached) {
    const ascending = [...contributions].sort((a, b) => a.date.localeCompare(b.date));
    let running = baseline;
    for (const c of ascending) {
      running += amountOf(c);
      if (running >= target) {
        const at = new Date(`${c.date}T00:00:00`);
        reachedInDays = Math.max(0, Math.round((at.getTime() - created.getTime()) / 86400000));
        break;
      }
    }
  }

  const daysLeft = days !== null ? Math.max(0, days) : null;
  const neededPerDay = daysLeft && daysLeft > 0 ? remaining / daysLeft : remaining;
  // Після фінішу денна норма вже ні до чого — показуємо реальний темп забігу.
  const paceDays = reached ? Math.max(1, reachedInDays ?? observedDays) : Math.max(1, totalDays ?? observedDays);
  const actualPerDay = Math.max(0, saved - baseline) / paceDays;

  // Прогноз рахується з темпу, набраного за вже пройдені дні, а не з планового:
  // питання саме в тому, куди приведе поточна швидкість.
  let forecastDate: string | null = null;
  if (phase !== 'done' && remaining > 0) {
    const perDay = Math.max(0, saved - baseline) / observedDays;
    if (perDay > 0) {
      const daysNeeded = Math.ceil(remaining / perDay);
      // Прогноз далі ніж на десять років — це вже не прогноз, а спосіб сказати
      // «такими темпами ніколи». Краще не показувати нічого.
      if (daysNeeded <= 3650) {
        const at = new Date(today);
        at.setDate(at.getDate() + daysNeeded);
        forecastDate = localIsoDate(at);
      }
    }
  }

  return {
    phase,
    rawPct,
    remaining,
    daysLeft,
    totalDays,
    reachedInDays,
    neededPerDay,
    actualPerDay,
    overachieved: Math.max(0, saved - target),
    forecastDate,
  };
};

/** Заробіток за період і за попередній такий самий відрізок — для плиток і карток. */
export const sumPeriodEarnings = (
  contributions: PaceContribution[],
  now: Date = new Date()
): { today: number; yesterday: number; month: number; prevMonth: number } => {
  const todayIso = localIsoDate(now);
  const monthPrefix = todayIso.slice(0, 7);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = localIsoDate(yesterday);

  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthPrefix = localIsoDate(prevMonthDate).slice(0, 7);

  let today = 0;
  let yesterdayTotal = 0;
  let month = 0;
  let prevMonth = 0;
  for (const c of contributions) {
    const amt = amountOf(c);
    if (c.date === todayIso) today += amt;
    if (c.date === yesterdayIso) yesterdayTotal += amt;
    if (c.date.startsWith(monthPrefix)) month += amt;
    if (c.date.startsWith(prevMonthPrefix)) prevMonth += amt;
  }
  return { today, yesterday: yesterdayTotal, month, prevMonth };
};
