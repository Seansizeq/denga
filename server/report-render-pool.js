/**
 * Пул потоків для малювання карток звіту.
 *
 * Одна картка — це 1080×1350 пікселів, намальованих чистим JS, і на сервері це
 * приблизно півсекунди суцільного рахунку. Поки вона малювалася в головному
 * потоці, весь застосунок стояв: жоден запит з міні-застосунку не обробляється,
 * поки не домалюється чужий звіт. На сотні звітів о двадцять першій це
 * означало хвилини недоступного API щовечора.
 *
 * Тому рендер живе у власному потоці, а головний лишається на запитах. Потік
 * піднімається лінивo — база без жодного авто-звіту не платить за нього нічого.
 *
 * `fallbackRender` — та сама функція рендера, але в головному потоці. Вона
 * потрібна на випадок, коли потік не піднімається взагалі (чужа збірка Node,
 * відсутній файл): краще пригальмувати, ніж залишити людей без звітів.
 */

export const DEFAULT_RENDER_TIMEOUT_MS = 20_000;

/**
 * Довша черга сенсу не має: такт розсилки і так стоїть на черзі Telegram у
 * 25 повідомлень на секунду, тож рендер попереду неї не забіжить.
 */
export const DEFAULT_RENDER_MAX_QUEUED = 200;

/** Після стількох підряд смертей потоку пул здається і рахує в головному. */
const MAX_CONSECUTIVE_WORKER_FAILURES = 3;

export const createReportRenderPool = ({
  spawnWorker,
  size = 1,
  timeoutMs = DEFAULT_RENDER_TIMEOUT_MS,
  maxQueued = DEFAULT_RENDER_MAX_QUEUED,
  fallbackRender = null,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (handle) => clearTimeout(handle),
  logger = console,
} = {}) => {
  const slots = Array.from({ length: Math.max(1, size) }, () => ({ worker: null, job: null }));
  const waiting = [];
  let nextJobId = 1;
  let consecutiveFailures = 0;
  let disabled = !spawnWorker;
  let closed = false;

  const toBuffer = (png) =>
    Buffer.isBuffer(png) ? png : Buffer.from(png.buffer, png.byteOffset, png.byteLength);

  const runInMainThread = async (payload) => {
    if (!fallbackRender) throw new Error('report render pool is unavailable');
    return fallbackRender(payload);
  };

  const settle = (slot, settleJob) => {
    if (slot.job && slot.job.id === settleJob.id) {
      cancel(slot.job.timer);
      slot.job = null;
    }
  };

  /** Мертвий потік не воскрешають: слот звільняється, наступна робота підніме новий. */
  const dropWorker = (slot, reason) => {
    const worker = slot.worker;
    slot.worker = null;
    if (worker) {
      try {
        worker.terminate();
      } catch {
        // потік уже мертвий — саме тому ми тут
      }
    }
    const job = slot.job;
    slot.job = null;
    if (job) {
      cancel(job.timer);
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_WORKER_FAILURES && fallbackRender) {
        disabled = true;
        logger.error?.('[report-render] потік не тримається, малюємо в головному потоці', { reason });
      }
      job.reject(new Error(`report render worker failed: ${reason}`));
    }
    pump();
  };

  const ensureWorker = (slot) => {
    if (slot.worker) return slot.worker;
    try {
      const worker = spawnWorker();
      worker.on('message', (message) => {
        const job = slot.job;
        if (!job || message?.id !== job.id) return;
        settle(slot, job);
        if (message.ok) {
          consecutiveFailures = 0;
          job.resolve(toBuffer(message.png));
        } else {
          // Малюнок не вдався, але потік живий — це помилка даних, не потоку.
          consecutiveFailures = 0;
          job.reject(new Error(String(message.error || 'report render failed')));
        }
        pump();
      });
      worker.on('error', (error) => dropWorker(slot, String(error?.message || error)));
      worker.on('exit', (code) => {
        if (slot.worker) dropWorker(slot, `worker exited with code ${code}`);
      });
      worker.unref?.();
      slot.worker = worker;
      return worker;
    } catch (error) {
      consecutiveFailures += 1;
      if (fallbackRender) {
        disabled = true;
        logger.error?.('[report-render] потік не запускається, малюємо в головному потоці', {
          message: String(error?.message || error),
        });
      }
      return null;
    }
  };

  const pump = () => {
    if (closed) return;
    for (const slot of slots) {
      if (slot.job || waiting.length === 0) continue;
      const worker = ensureWorker(slot);
      if (!worker) {
        // Потік не піднявся: черга не має тут застрягати.
        const job = waiting.shift();
        if (!job) return;
        runInMainThread(job.payload).then(job.resolve, job.reject);
        continue;
      }
      const job = waiting.shift();
      job.timer = schedule(() => dropWorker(slot, `render timed out after ${timeoutMs}ms`), timeoutMs);
      slot.job = job;
      try {
        worker.postMessage({ id: job.id, payload: job.payload });
      } catch (error) {
        dropWorker(slot, String(error?.message || error));
      }
    }
  };

  return {
    /**
     * @param {object} payload аргументи `renderFinancialReportCardPng`
     * @returns {Promise<Buffer>}
     */
    render(payload) {
      if (closed) return Promise.reject(new Error('report render pool is closed'));
      if (disabled) return runInMainThread(payload);
      if (waiting.length >= maxQueued) {
        return Promise.reject(new Error(`report render queue overflow (${maxQueued})`));
      }
      return new Promise((resolve, reject) => {
        waiting.push({ id: nextJobId++, payload, resolve, reject, timer: null });
        pump();
      });
    },
    async close() {
      closed = true;
      for (const slot of slots) {
        if (slot.job) {
          cancel(slot.job.timer);
          slot.job.reject(new Error('report render pool is closed'));
          slot.job = null;
        }
        const worker = slot.worker;
        slot.worker = null;
        if (worker) {
          try {
            await worker.terminate();
          } catch {
            // нічого не вдієш і нічого не втрачено
          }
        }
      }
      while (waiting.length > 0) waiting.shift().reject(new Error('report render pool is closed'));
    },
    stats: () => ({
      queued: waiting.length,
      busy: slots.filter((slot) => slot.job).length,
      workers: slots.filter((slot) => slot.worker).length,
      disabled,
    }),
  };
};
