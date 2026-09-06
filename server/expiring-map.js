/**
 * Map, записи якої не живуть вічно.
 *
 * У боті кілька таких сховищ: незавершена транзакція, вибір шаблону зміни,
 * картка підтвердження, час останнього скріншота. Усі вони очищаються, коли
 * людина доводить дію до кінця — і не очищаються ніколи, якщо вона просто
 * закриває чат. На одному користувачі це непомітно, на тисячі — процес, що
 * повільно росте й не віддає памʼять до перезапуску.
 *
 * Прибирання зроблене так само, як у `rate-limit.js`: не за таймером, а
 * принагідно, під час звичайних звернень і не частіше, ніж раз на строк
 * життя. Власного таймера тут навмисно немає — він тримав би процес живим і
 * заважав коректному завершенню.
 */

/**
 * @param {{ ttlMs: number, nowFn?: () => number }} options
 * @returns {{ get: Function, set: Function, has: Function, delete: Function,
 *             size: () => number, sweep: (now?: number) => number }}
 */
export const createExpiringMap = ({ ttlMs, nowFn = () => Date.now() } = {}) => {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('createExpiringMap: ttlMs має бути додатним');

  /** @type {Map<unknown, { value: unknown, expiresAt: number }>} */
  const entries = new Map();
  let lastSweepAt = nowFn();

  const sweep = (now = nowFn()) => {
    let removed = 0;
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) {
        entries.delete(key);
        removed += 1;
      }
    }
    lastSweepAt = now;
    return removed;
  };

  const maybeSweep = (now) => {
    if (now - lastSweepAt < ttlMs) return;
    sweep(now);
  };

  const read = (key, now) => {
    const entry = entries.get(key);
    if (!entry) return undefined;
    // Протермінований запис не віддається навіть до того, як його прибрали:
    // інакше поведінка залежала б від того, чи встиг пройти прибиральник.
    if (entry.expiresAt <= now) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    get(key) {
      return read(key, nowFn())?.value;
    },
    has(key) {
      return read(key, nowFn()) !== undefined;
    },
    set(key, value) {
      const now = nowFn();
      maybeSweep(now);
      entries.set(key, { value, expiresAt: now + ttlMs });
      return this;
    },
    delete(key) {
      return entries.delete(key);
    },
    /** Скільки записів іще живі. Протерміновані, але не прибрані, не рахуються. */
    size() {
      const now = nowFn();
      let alive = 0;
      for (const entry of entries.values()) if (entry.expiresAt > now) alive += 1;
      return alive;
    },
    sweep,
  };
};
