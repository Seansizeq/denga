import { describe, expect, it, vi } from 'vitest';
import {
  automationKey,
  clientIpKey,
  createRateLimiter,
  rateLimitMiddleware,
} from './rate-limit.js';

const reqWith = (overrides = {}) => ({
  ip: '203.0.113.7',
  socket: { remoteAddress: '203.0.113.7' },
  get: () => '',
  query: {},
  ...overrides,
});

describe('createRateLimiter', () => {
  it('allows up to max requests inside one window and blocks the next one', () => {
    let now = 1_000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3, keyFn: () => 'k', nowFn: () => now });

    expect(limiter.check({}).allowed).toBe(true);
    expect(limiter.check({}).allowed).toBe(true);
    expect(limiter.check({}).allowed).toBe(true);

    const blocked = limiter.check({});
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
  });

  it('starts a fresh window once the previous one expires', () => {
    let now = 1_000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, keyFn: () => 'k', nowFn: () => now });

    expect(limiter.check({}).allowed).toBe(true);
    expect(limiter.check({}).allowed).toBe(false);

    now += 60_001;
    expect(limiter.check({}).allowed).toBe(true);
  });

  /**
   * Головне, заради чого ключ узагалі налаштовується: за nginx усі запити
   * приходять з 127.0.0.1, і спільне відро означало б, що один клієнт вичерпує
   * ліміт решти.
   */
  it('counts each key separately', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, keyFn: (req) => req.who });

    expect(limiter.check({ who: 'a' }).allowed).toBe(true);
    expect(limiter.check({ who: 'b' }).allowed).toBe(true);
    expect(limiter.check({ who: 'a' }).allowed).toBe(false);
  });

  it('does not count a request the key function declines to identify', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, keyFn: () => null });

    expect(limiter.check({}).allowed).toBe(true);
    expect(limiter.check({}).allowed).toBe(true);
    expect(limiter.size()).toBe(0);
  });

  /**
   * Потік підроблених токенів дає нескінченний потік унікальних ключів. Без
   * прибирання це витік пам'яті, який відкривається тим самим запитом, що його
   * ліміт має спиняти.
   */
  it('drops expired buckets so unique keys cannot grow the map forever', () => {
    let now = 1_000;
    const limiter = createRateLimiter({ windowMs: 1_000, max: 5, keyFn: (req) => req.who, nowFn: () => now });

    for (let i = 0; i < 50; i += 1) limiter.check({ who: `guess-${i}` });
    expect(limiter.size()).toBe(50);

    now += 5_000;
    limiter.check({ who: 'later' });
    expect(limiter.size()).toBe(1);
  });

  it('rejects a nonsensical configuration instead of silently not limiting', () => {
    expect(() => createRateLimiter({ windowMs: 0, max: 1, keyFn: () => 'k' })).toThrow();
    expect(() => createRateLimiter({ windowMs: 1, max: 0, keyFn: () => 'k' })).toThrow();
    expect(() => createRateLimiter({ windowMs: 1, max: 1 })).toThrow();
  });
});

describe('rateLimitMiddleware', () => {
  const resStub = () => {
    const res = { statusCode: 0, headers: {}, body: null };
    res.set = (name, value) => {
      res.headers[name] = value;
      return res;
    };
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (payload) => {
      res.body = payload;
      return res;
    };
    return res;
  };

  it('passes the request through while under the limit', () => {
    const middleware = rateLimitMiddleware({ windowMs: 60_000, max: 2, keyFn: () => 'k' });
    const next = vi.fn();

    middleware(reqWith(), resStub(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('answers 429 with Retry-After and does not call next', () => {
    const middleware = rateLimitMiddleware({ windowMs: 60_000, max: 1, keyFn: () => 'k' });
    const next = vi.fn();

    middleware(reqWith(), resStub(), next);
    const res = resStub();
    middleware(reqWith(), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('60');
    expect(res.body).toMatchObject({ code: 'RATE_LIMITED' });
  });
});

describe('automationKey', () => {
  it('prefers the bearer token so one shortcut gets its own bucket', () => {
    const req = reqWith({ get: (name) => (name === 'Authorization' ? 'Bearer abc123' : '') });
    expect(automationKey(req)).toBe('t:abc123');
  });

  it('falls back to the query token iOS Shortcuts uses for a plain GET', () => {
    expect(automationKey(reqWith({ query: { token: 'abc123' } }))).toBe('t:abc123');
  });

  /**
   * Запити без токена — це рівно ті, хто його добирає. Спільне відро по IP для
   * них правильне: вони не мають чим себе розділити.
   */
  it('buckets tokenless requests by address', () => {
    expect(automationKey(reqWith())).toBe('ip:203.0.113.7');
  });

  /**
   * Межа цього ключа, зафіксована навмисно: кожен вигаданий токен — нове
   * порожнє відро, тож сам по собі він потік підробок не рахує. Саме тому на
   * /api/automation поруч стоїть другий лічильник по адресі.
   */
  it('gives every distinct token its own bucket, guessed ones included', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, keyFn: automationKey });

    expect(limiter.check(reqWith({ query: { token: 'guess-1' } })).allowed).toBe(true);
    expect(limiter.check(reqWith({ query: { token: 'guess-2' } })).allowed).toBe(true);
    expect(limiter.check(reqWith({ query: { token: 'guess-3' } })).allowed).toBe(true);

    // А ось повтор того самого токена рахується.
    expect(limiter.check(reqWith({ query: { token: 'guess-1' } })).allowed).toBe(false);
  });
});

describe('clientIpKey', () => {
  it('falls back to the socket address when req.ip is absent', () => {
    expect(clientIpKey({ socket: { remoteAddress: '198.51.100.4' } })).toBe('198.51.100.4');
  });

  it('never returns an empty key', () => {
    expect(clientIpKey({})).toBe('unknown');
  });
});
