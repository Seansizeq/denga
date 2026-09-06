import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LATENCY_BUCKETS_MS, createHealthHandlers, createRequestMetrics } from './health.js';

let db;
const previousToken = process.env.METRICS_TOKEN;

beforeEach(async () => {
  db = await open({ filename: ':memory:', driver: sqlite3.Database });
});

afterEach(async () => {
  await db.close();
  if (previousToken === undefined) delete process.env.METRICS_TOKEN;
  else process.env.METRICS_TOKEN = previousToken;
});

/** Мінімальний res, що запамʼятовує, чим відповіли. */
const makeRes = () => {
  const res = { statusCode: 200, body: null, listeners: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.on = (event, fn) => { res.listeners[event] = fn; };
  return res;
};

const makeReq = ({ headers = {}, query = {}, method = 'GET', path = '/api/x' } = {}) => ({
  method,
  path,
  query,
  get: (name) => headers[name] ?? headers[name.toLowerCase()] ?? undefined,
});

describe('healthz', () => {
  it('каже, що живий, поки база відповідає', async () => {
    const { healthz } = createHealthHandlers({ db, role: 'api' });
    const res = makeRes();
    await healthz(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, role: 'api' });
  });

  it('віддає 503, коли база не відповідає', async () => {
    const broken = { get: async () => { throw new Error('SQLITE_CORRUPT'); } };
    const { healthz } = createHealthHandlers({ db: broken, role: 'api' });
    const res = makeRes();
    await healthz(makeReq(), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain('SQLITE_CORRUPT');
  });

  it('кешує відповідь — nginx смикає цей шлях постійно', async () => {
    let calls = 0;
    const counting = { get: async () => { calls += 1; return { 1: 1 }; } };
    let clock = 0;
    const { healthz } = createHealthHandlers({ db: counting, role: 'api', now: () => clock });

    await healthz(makeReq(), makeRes());
    await healthz(makeReq(), makeRes());
    expect(calls).toBe(1);

    clock += 5000;
    await healthz(makeReq(), makeRes());
    expect(calls).toBe(2);
  });

  it('не робить quick_check — він читає всю базу', async () => {
    // Перевірка цілісності живе в щоденному бекапі. Тут вона перетворила б
    // найчастіший запит у системі на найдорожчий.
    const queries = [];
    const spy = { get: async (sql) => { queries.push(sql); return {}; } };
    const { healthz } = createHealthHandlers({ db: spy, role: 'api' });
    await healthz(makeReq(), makeRes());

    expect(queries.join(' ')).not.toMatch(/quick_check|integrity_check/i);
  });
});

describe('metrics', () => {
  it('без заданого токена шлях просто не існує', async () => {
    delete process.env.METRICS_TOKEN;
    const { metrics } = createHealthHandlers({ db, role: 'api' });
    const res = makeRes();
    await metrics(makeReq(), res);

    // Саме 404, а не 403: неіснуючий маршрут не підказує, що тут є що вмикати.
    expect(res.statusCode).toBe(404);
  });

  it('відхиляє чужий токен так само, як відсутній', async () => {
    process.env.METRICS_TOKEN = 'таємниця';
    const { metrics } = createHealthHandlers({ db, role: 'api' });
    const res = makeRes();
    await metrics(makeReq({ headers: { Authorization: 'Bearer не-та' } }), res);

    expect(res.statusCode).toBe(404);
  });

  it('пускає з правильним токеном у заголовку й у параметрі', async () => {
    process.env.METRICS_TOKEN = 'таємниця';
    const { metrics } = createHealthHandlers({ db, role: 'bot', collect: () => ({ outbox: 3 }) });

    const byHeader = makeRes();
    await metrics(makeReq({ headers: { Authorization: 'Bearer таємниця' } }), byHeader);
    expect(byHeader.body).toMatchObject({ role: 'bot', outbox: 3 });

    const byQuery = makeRes();
    await metrics(makeReq({ query: { token: 'таємниця' } }), byQuery);
    expect(byQuery.body).toMatchObject({ role: 'bot', outbox: 3 });
  });

  it('віддає числа ролі разом із памʼяттю процесу', async () => {
    process.env.METRICS_TOKEN = 'т';
    const { metrics } = createHealthHandlers({
      db, role: 'api', collect: async () => ({ requests: { total: 7 } }),
    });
    const res = makeRes();
    await metrics(makeReq({ headers: { Authorization: 'Bearer т' } }), res);

    expect(res.body.memoryMb.rss).toBeGreaterThan(0);
    expect(res.body.requests.total).toBe(7);
  });
});

describe('createRequestMetrics', () => {
  it('рахує відповіді за класами', () => {
    let clock = 0;
    const m = createRequestMetrics({ now: () => clock });
    for (const [status, ms] of [[200, 5], [304, 2], [401, 1], [429, 1], [500, 30]]) {
      m.record(status, ms, 'GET', '/api/x');
    }
    const s = m.snapshot();
    expect(s.total).toBe(5);
    expect(s.ok).toBe(1);
    expect(s.notModified).toBe(1);
    expect(s.unauthorized).toBe(1);
    expect(s.rateLimited).toBe(1);
    expect(s.serverError).toBe(1);
    // 304 не має рахуватися як помилка клієнта — це найчастіша здорова відповідь.
    expect(s.clientError).toBe(2);
  });

  it('складає затримки у відра, а не в список', () => {
    const m = createRequestMetrics();
    m.record(200, 5, 'GET', '/a');
    m.record(200, 300, 'GET', '/b');
    m.record(200, 9999, 'GET', '/c');
    const s = m.snapshot();

    expect(s.latencyMs['<10']).toBe(1);
    expect(s.latencyMs['<500']).toBe(1);
    expect(s.latencyMs[`>=${LATENCY_BUCKETS_MS.at(-1)}`]).toBe(1);
  });

  it('запамʼятовує найповільніший запит', () => {
    const m = createRequestMetrics();
    m.record(200, 12, 'GET', '/api/fast');
    m.record(200, 900, 'POST', '/api/slow');
    m.record(200, 30, 'GET', '/api/other');

    expect(m.snapshot().slowest).toEqual({ ms: 900, method: 'POST', path: '/api/slow' });
  });

  it('не заводить лічильника на кожен шлях — інакше це витік памʼяті', () => {
    const m = createRequestMetrics();
    for (let i = 0; i < 1000; i += 1) m.record(200, 1, 'GET', `/api/goals/${i}`);
    const s = m.snapshot();

    // Розмір знімка не залежить від кількості різних шляхів.
    expect(Object.keys(s)).toEqual(
      expect.arrayContaining(['total', 'ok', 'latencyMs', 'slowest']),
    );
    expect(JSON.stringify(s).length).toBeLessThan(600);
  });

  it('middleware записує результат після завершення відповіді', () => {
    let clock = 0;
    const m = createRequestMetrics({ now: () => clock });
    const res = makeRes();
    m.middleware(makeReq({ method: 'POST', path: '/api/transactions' }), res, () => {});

    clock = 42;
    res.statusCode = 201;
    res.listeners.finish();

    expect(m.snapshot().total).toBe(1);
    expect(m.snapshot().slowest).toEqual({ ms: 42, method: 'POST', path: '/api/transactions' });
  });
});
