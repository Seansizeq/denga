/**
 * Робочий потік, що малює картку звіту.
 *
 * Тут навмисно немає нічого, крім рендера: потік піднімається один раз і живе
 * весь час роботи процесу, тож зайвий імпорт означав би зайвий шрифт у пам'яті
 * та ще одне з'єднання з базою, якого потоку не треба.
 */
import { parentPort } from 'node:worker_threads';
import { renderFinancialReportCardPng } from './report-card.js';

if (!parentPort) throw new Error('report render worker must be started as a worker thread');

parentPort.on('message', async (job) => {
  const id = job?.id;
  try {
    const png = await renderFinancialReportCardPng(job?.payload ?? {});
    // Копія, а не вигляд на буфер Node: пул буферів спільний, і передати його
    // власність головному потоку означало б відібрати пам'ять у самого себе.
    const bytes = Uint8Array.from(png);
    parentPort.postMessage({ id, ok: true, png: bytes }, [bytes.buffer]);
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: String(error?.stack || error?.message || error) });
  }
});
