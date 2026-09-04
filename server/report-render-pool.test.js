import { describe, expect, it, vi } from 'vitest';
import { createReportRenderPool } from './report-render-pool.js';

/** Заглушка потоку: та сама поверхня, що й у `worker_threads`, але керована з тесту. */
const createFakeWorker = () => {
  const handlers = new Map();
  return {
    posted: [],
    terminated: 0,
    unrefed: 0,
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    postMessage(message) {
      this.posted.push(message);
    },
    terminate() {
      this.terminated += 1;
    },
    unref() {
      this.unrefed += 1;
    },
    emit(event, arg) {
      for (const handler of handlers.get(event) ?? []) handler(arg);
    },
    reply(index = 0, png = Uint8Array.from([1, 2, 3])) {
      this.emit('message', { id: this.posted[index].id, ok: true, png });
    },
  };
};

const silentLogger = { warn: () => {}, error: () => {} };

const poolWith = (workers, overrides = {}) => {
  const spawned = [];
  const pool = createReportRenderPool({
    spawnWorker: () => {
      const worker = workers[spawned.length] ?? createFakeWorker();
      spawned.push(worker);
      return worker;
    },
    logger: silentLogger,
    ...overrides,
  });
  return { pool, spawned };
};

describe('createReportRenderPool', () => {
  it('renders in the worker and hands back a buffer', async () => {
    const worker = createFakeWorker();
    const { pool } = poolWith([worker]);

    const rendering = pool.render({ reportType: 'weekly' });
    expect(worker.posted[0].payload).toEqual({ reportType: 'weekly' });

    worker.reply(0, Uint8Array.from([137, 80, 78, 71]));
    const png = await rendering;

    expect(Buffer.isBuffer(png)).toBe(true);
    expect([...png]).toEqual([137, 80, 78, 71]);
  });

  it('starts the worker only when there is something to draw', () => {
    const { pool, spawned } = poolWith([createFakeWorker()]);

    expect(spawned).toHaveLength(0);
    expect(pool.stats().workers).toBe(0);
  });

  /** Головне, заради чого пул існує: другий звіт чекає, а не малюється паралельно в тому ж потоці. */
  it('holds the next report until the worker is free', async () => {
    const worker = createFakeWorker();
    const { pool } = poolWith([worker]);

    const first = pool.render({ reportType: 'weekly' });
    const second = pool.render({ reportType: 'monthly' });

    expect(worker.posted).toHaveLength(1);
    expect(pool.stats().queued).toBe(1);

    worker.reply(0);
    await first;
    expect(worker.posted).toHaveLength(2);

    worker.reply(1);
    await expect(second).resolves.toBeInstanceOf(Buffer);
  });

  it('spreads work over several workers', async () => {
    const workers = [createFakeWorker(), createFakeWorker()];
    const { pool } = poolWith(workers, { size: 2 });

    const both = Promise.all([pool.render({ a: 1 }), pool.render({ b: 2 })]);

    expect(workers[0].posted).toHaveLength(1);
    expect(workers[1].posted).toHaveLength(1);

    workers[0].reply(0);
    workers[1].reply(0);
    await expect(both).resolves.toHaveLength(2);
  });

  it('rejects the report the worker could not draw but keeps the worker', async () => {
    const worker = createFakeWorker();
    const { pool, spawned } = poolWith([worker, createFakeWorker()]);

    const rendering = pool.render({ reportType: 'weekly' });
    worker.emit('message', { id: worker.posted[0].id, ok: false, error: 'report font not available' });

    await expect(rendering).rejects.toThrow(/report font not available/);
    expect(worker.terminated).toBe(0);

    const next = pool.render({ reportType: 'monthly' });
    expect(spawned).toHaveLength(1);
    worker.reply(1);
    await expect(next).resolves.toBeInstanceOf(Buffer);
  });

  it('replaces a worker that died mid-render', async () => {
    const first = createFakeWorker();
    const second = createFakeWorker();
    const { pool, spawned } = poolWith([first, second]);

    const rendering = pool.render({ reportType: 'weekly' });
    first.emit('error', new Error('out of memory'));

    await expect(rendering).rejects.toThrow(/out of memory/);

    const next = pool.render({ reportType: 'monthly' });
    expect(spawned).toHaveLength(2);
    second.reply(0);
    await expect(next).resolves.toBeInstanceOf(Buffer);
  });

  it('kills a worker that stopped answering', async () => {
    const worker = createFakeWorker();
    const timers = [];
    const { pool } = poolWith([worker], {
      timeoutMs: 1234,
      schedule: (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length;
      },
      cancel: () => {},
    });

    const rendering = pool.render({ reportType: 'weekly' });
    expect(timers[0].ms).toBe(1234);

    timers[0].fn();

    await expect(rendering).rejects.toThrow(/timed out/);
    expect(worker.terminated).toBe(1);
  });

  /**
   * Малювати в головному потоці погано, але лишити людей зовсім без звітів гірше:
   * якщо потік не тримається взагалі, пул здається свідомо.
   */
  it('falls back to the main thread after the worker dies again and again', async () => {
    const fallbackRender = vi.fn(async () => Buffer.from([9]));
    const workers = [createFakeWorker(), createFakeWorker(), createFakeWorker(), createFakeWorker()];
    const { pool } = poolWith(workers, { fallbackRender });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const rendering = pool.render({ attempt });
      workers[attempt].emit('error', new Error('boom'));
      await expect(rendering).rejects.toThrow(/boom/);
    }

    await expect(pool.render({ attempt: 'after' })).resolves.toEqual(Buffer.from([9]));
    expect(fallbackRender).toHaveBeenCalledTimes(1);
    expect(pool.stats().disabled).toBe(true);
  });

  it('renders in the main thread when the worker cannot be started at all', async () => {
    const fallbackRender = vi.fn(async () => Buffer.from([7]));
    const pool = createReportRenderPool({
      spawnWorker: () => {
        throw new Error('worker_threads unavailable');
      },
      fallbackRender,
      logger: silentLogger,
    });

    await expect(pool.render({ reportType: 'weekly' })).resolves.toEqual(Buffer.from([7]));
    expect(fallbackRender).toHaveBeenCalledTimes(1);
  });

  it('refuses more work than it can hold', async () => {
    const worker = createFakeWorker();
    const { pool } = poolWith([worker], { maxQueued: 1 });

    const running = pool.render({ n: 1 });
    const queued = pool.render({ n: 2 });
    await expect(pool.render({ n: 3 })).rejects.toThrow(/overflow/);

    worker.reply(0);
    await running;
    worker.reply(1);
    await queued;
  });

  it('lets go of everything on close', async () => {
    const worker = createFakeWorker();
    const { pool } = poolWith([worker]);

    const running = pool.render({ n: 1 });
    const queued = pool.render({ n: 2 });

    await pool.close();

    await expect(running).rejects.toThrow(/closed/);
    await expect(queued).rejects.toThrow(/closed/);
    await expect(pool.render({ n: 3 })).rejects.toThrow(/closed/);
    expect(worker.terminated).toBe(1);
  });

  it('reports the render failure when there is nowhere to fall back to', async () => {
    const pool = createReportRenderPool({
      spawnWorker: () => {
        throw new Error('worker_threads unavailable');
      },
      logger: silentLogger,
    });

    await expect(pool.render({})).rejects.toThrow(/unavailable/);
  });
});
