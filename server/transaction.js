/**
 * Черга транзакцій процесу.
 *
 * `BEGIN` діє на з'єднання, а з'єднання в нас одне на весь процес. Два
 * обробники, що почали транзакцію одночасно, опиняються в одній: `COMMIT`
 * першого фіксує напівроботу другого, а `ROLLBACK` другого скасовує вже
 * підтверджене першим. Виглядає це як «баланс іноді не сходиться», і зловити
 * це в логах майже неможливо.
 *
 * Тому транзакції шикуються в чергу: наступна починається лише після
 * `COMMIT`/`ROLLBACK` попередньої. Читання поза транзакціями чергу не проходять
 * — у WAL вони й так не блокуються.
 */
let txChain = Promise.resolve();
const NOOP = () => undefined;

/** Для тестів: дочекатися, поки розсмокчеться черга транзакцій. */
export const waitForPendingTransactions = () => txChain;

/**
 * Єдиний спосіб відкрити транзакцію. Пряме `db.run('BEGIN')` повз цю функцію
 * повертає ту саму проблему, заради якої вона існує.
 *
 * Другим аргументом `fn` отримує `afterCommit(cb)`. Усе, що ходить у мережу —
 * повідомлення в Telegram, алерти бюджету — має реєструватися саме там.
 * Причина конкретна: раніше `bot.sendMessage()` викликався всередині
 * `BEGIN IMMEDIATE`, тобто ексклюзивний лок на запис у **всю базу** тримався
 * доти, доки повідомлення чекало свого слота в черзі з лімітом 25/с. Під
 * навантаженням це зупиняє геть усі записи, включно з іншими процесами.
 *
 * Колбеки виконуються після зняття локу й **поза** чергою, тож наступна
 * транзакція не чекає на мережу. Помилка в колбеку логується й не скасовує вже
 * зафіксовану транзакцію: гроші записані, не доїхало тільки сповіщення.
 *
 * @param {import('sqlite').Database} db
 * @param {(db: import('sqlite').Database, afterCommit: (cb: () => unknown) => void) => Promise<T>} fn
 * @param {{ mode?: 'DEFERRED' | 'IMMEDIATE' | 'EXCLUSIVE', logger?: Console }} [options]
 * @returns {Promise<T>}
 * @template T
 */
export const withTransaction = async (db, fn, { mode = 'IMMEDIATE', logger = console } = {}) => {
  const afterCommit = [];
  const register = (cb) => {
    if (typeof cb === 'function') afterCommit.push(cb);
  };

  const committed = txChain.then(async () => {
    await db.run(`BEGIN ${mode}`);
    try {
      const out = await fn(db, register);
      await db.run('COMMIT');
      return out;
    } catch (error) {
      try {
        await db.run('ROLLBACK');
      } catch {
        // Транзакції могло вже не бути — тоді відкочувати нічого й помилка тут
        // лише сховала б справжню причину нижче.
      }
      throw error;
    }
  });

  // Наступна транзакція чекає рівно на COMMIT/ROLLBACK. Побічні ефекти нижче
  // до черги не входять — інакше мережа знову опинилася б на шляху записів.
  txChain = committed.then(NOOP, NOOP);

  const result = await committed;

  for (const cb of afterCommit) {
    try {
      await cb();
    } catch (error) {
      logger.error?.('[db] afterCommit failed', error);
    }
  }
  return result;
};
