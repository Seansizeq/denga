/**
 * Коректне завершення процесу.
 *
 * pm2 на `restart` шле SIGTERM і через `kill_timeout` (за замовчуванням 1600 мс)
 * добиває SIGKILL. Тому вся послідовність нижче має вкластися в цей бюджет,
 * інакше сенсу в ній немає — процес усе одно вб'ють на середині.
 *
 * Сам по собі SIGKILL базу не псує: WAL + `synchronous = FULL` це переживають,
 * відновлення відбувається при наступному відкритті. Сенс тут інший — не рвати
 * запити на півдорозі й лишати після себе закріплену базу, а не -wal, більший
 * за саму базу (станом на 25.08 на проді було 988 КБ проти 372 КБ бази).
 */

/** Кожен крок обмежений і власною стелею, і залишком спільного бюджету. */
const STEP_SHARE = {
  http: 0.3,
  telegram: 0.2,
  walCheckpoint: 0.3,
};

export const DEFAULT_SHUTDOWN_BUDGET_MS = 1500;

/**
 * Крок ніколи не кидає й ніколи не висить довше за `ms`: зупинка на одному
 * етапі не повинна коштувати нам закриття бази, заради якого все це й робиться.
 */
const runStep = async (name, ms, fn) => {
  if (typeof fn !== 'function') return { name, status: 'skipped' };
  if (ms <= 0) return { name, status: 'timeout', reason: 'бюджет вичерпано' };

  let timer = null;
  try {
    const outcome = await Promise.race([
      Promise.resolve()
        .then(fn)
        .then(() => ({ status: 'ok' })),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ status: 'timeout', reason: `не вклався у ${ms} мс` }), ms);
      }),
    ]);
    return { name, ...outcome };
  } catch (e) {
    return { name, status: 'failed', reason: e?.message || String(e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Порядок важливий: спершу перестаємо приймати нову роботу (HTTP і Telegram),
 * і лише потім чіпаємо базу — інакше зливаємо WAL, у який тут-таки допишуть.
 *
 * Не викликає `process.exit` — щоб її можна було проганяти в тестах.
 *
 * @returns {Promise<{ steps: Array<{ name: string, status: string, reason?: string }> }>}
 */
export async function runShutdownSequence({
  server,
  db,
  bot,
  budgetMs = DEFAULT_SHUTDOWN_BUDGET_MS,
  log = console,
} = {}) {
  const deadline = Date.now() + budgetMs;
  const left = () => Math.max(0, deadline - Date.now());
  const slice = (share) => Math.min(Math.round(budgetMs * share), left());

  const steps = [];

  // `server.close()` лише перестає слухати порт, а резолвиться аж коли доживуть
  // усі keep-alive з'єднання. Чекати на них ми не можемо, тому даємо коротку
  // паузу й рвемо решту примусово.
  steps.push(
    await runStep(
      'http',
      slice(STEP_SHARE.http),
      typeof server?.close === 'function'
        ? async () => {
            server.close();
            if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
          }
        : null,
    ),
  );

  // `cancel: true` обриває відкритий long-poll, інакше стоїмо до його таймауту.
  steps.push(
    await runStep(
      'telegram',
      slice(STEP_SHARE.telegram),
      typeof bot?.stopPolling === 'function' ? async () => bot.stopPolling({ cancel: true }) : null,
    ),
  );

  // TRUNCATE, а не PASSIVE: переносить усе в базу й обнуляє -wal. Дублює те, що
  // SQLite зробить сам на закритті останнього з'єднання, але лишається нашою
  // страховкою, якщо `close` нижче не встигне.
  steps.push(
    await runStep(
      'wal-checkpoint',
      slice(STEP_SHARE.walCheckpoint),
      typeof db?.exec === 'function' ? async () => db.exec('PRAGMA wal_checkpoint(TRUNCATE)') : null,
    ),
  );

  steps.push(
    await runStep('db-close', left(), typeof db?.close === 'function' ? async () => db.close() : null),
  );

  const failed = steps.filter((s) => s.status === 'timeout' || s.status === 'failed');
  if (failed.length) {
    log.warn?.(
      '[shutdown] кроки без успіху: %s',
      failed.map((s) => `${s.name} (${s.reason})`).join(', '),
    );
  }
  log.log?.('[shutdown] %s', steps.map((s) => `${s.name}:${s.status}`).join(' '));

  // При закритті останнього з'єднання SQLite сам прибирає -wal і -shm; якщо вони
  // лишилися, база закрилася не до кінця — наступний старт це полагодить, але
  // знати про це корисно, бо саме такий слід був після серпневого падіння.
  return { steps };
}

/**
 * Вішає обробники сигналів. Повторний сигнал під час завершення — це «я не хочу
 * чекати», тому виходимо негайно.
 *
 * @returns {() => void} знімає обробники (потрібно тестам)
 */
export function installGracefulShutdown({
  server,
  db,
  bot,
  budgetMs = DEFAULT_SHUTDOWN_BUDGET_MS,
  log = console,
  exit = (code) => process.exit(code),
  signals = ['SIGTERM', 'SIGINT'],
  target = process,
} = {}) {
  let shuttingDown = false;

  const onSignal = (signal) => {
    if (shuttingDown) {
      log.warn?.('[shutdown] %s повторно — виходимо негайно', signal);
      exit(1);
      return;
    }
    shuttingDown = true;
    log.log?.('[shutdown] отримано %s, бюджет %d мс', signal, budgetMs);

    // Страховка на випадок, якщо щось не пустить нас далі попри всі таймаути:
    // unref, щоб сам таймер не тримав процес живим, коли все пройшло чисто.
    const failsafe = setTimeout(() => {
      log.warn?.('[shutdown] бюджет вичерпано, примусовий вихід');
      exit(1);
    }, budgetMs + 250);
    if (typeof failsafe.unref === 'function') failsafe.unref();

    void runShutdownSequence({ server, db, bot, budgetMs, log })
      .catch((e) => log.error?.('[shutdown] неочікувана помилка', e))
      .finally(() => {
        clearTimeout(failsafe);
        exit(0);
      });
  };

  const handlers = signals.map((signal) => {
    const handler = () => onSignal(signal);
    target.on(signal, handler);
    return { signal, handler };
  });

  return () => {
    for (const { signal, handler } of handlers) target.off?.(signal, handler);
  };
}
