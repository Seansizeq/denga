import { describe, expect, it } from 'vitest';
import {
  AUTH_CODES,
  DEFAULT_INIT_DATA_MAX_AGE_SEC,
  hashesMatch,
  signTelegramInitData,
  verifyTelegramInitData,
} from './telegram-auth.js';

const BOT_TOKEN = '123456:AAH-test-token';
const NOW_MS = Date.UTC(2026, 7, 19, 12, 0, 0);
const nowSec = Math.floor(NOW_MS / 1000);

const validInitData = (overrides = {}, token = BOT_TOKEN) =>
  signTelegramInitData(
    {
      auth_date: nowSec,
      query_id: 'AAF',
      user: JSON.stringify({ id: 42, first_name: 'Bodya' }),
      ...overrides,
    },
    token
  );

describe('verifyTelegramInitData', () => {
  it('accepts a freshly signed string and returns the user id', () => {
    const result = verifyTelegramInitData(validInitData(), { botToken: BOT_TOKEN, nowMs: NOW_MS });
    expect(result).toEqual({ ok: true, userId: '42' });
  });

  /**
   * Головний сенс усієї перевірки: без токена ключ HMAC рахувався б від
   * порожнього рядка — константи, яку може обчислити будь-хто, — і підпис став
   * би підробним для довільного user.id.
   */
  it('refuses when no bot token is configured, even for a string signed with an empty token', () => {
    const forged = validInitData({}, '');
    expect(verifyTelegramInitData(forged, { botToken: '', nowMs: NOW_MS })).toEqual({
      ok: false,
      code: AUTH_CODES.misconfigured,
    });
    expect(verifyTelegramInitData(forged, { botToken: undefined, nowMs: NOW_MS })).toEqual({
      ok: false,
      code: AUTH_CODES.misconfigured,
    });
  });

  it('rejects a string signed with a different bot token', () => {
    const result = verifyTelegramInitData(validInitData({}, 'другий:токен'), {
      botToken: BOT_TOKEN,
      nowMs: NOW_MS,
    });
    expect(result).toEqual({ ok: false, code: AUTH_CODES.invalid });
  });

  it('rejects a tampered payload whose hash was left untouched', () => {
    const original = validInitData();
    const tampered = original.replace(
      encodeURIComponent(JSON.stringify({ id: 42, first_name: 'Bodya' })),
      encodeURIComponent(JSON.stringify({ id: 99, first_name: 'Bodya' }))
    );
    expect(tampered).not.toBe(original);
    expect(verifyTelegramInitData(tampered, { botToken: BOT_TOKEN, nowMs: NOW_MS })).toEqual({
      ok: false,
      code: AUTH_CODES.invalid,
    });
  });

  it('still accepts a string just inside the freshness window', () => {
    const initData = validInitData({ auth_date: nowSec - DEFAULT_INIT_DATA_MAX_AGE_SEC + 60 });
    expect(verifyTelegramInitData(initData, { botToken: BOT_TOKEN, nowMs: NOW_MS })).toEqual({
      ok: true,
      userId: '42',
    });
  });

  /** Перехоплений рядок не має лишатися ключем від акаунта назавжди. */
  it('expires a correctly signed string once it is older than the window', () => {
    const initData = validInitData({ auth_date: nowSec - DEFAULT_INIT_DATA_MAX_AGE_SEC - 1 });
    expect(verifyTelegramInitData(initData, { botToken: BOT_TOKEN, nowMs: NOW_MS })).toEqual({
      ok: false,
      code: AUTH_CODES.expired,
    });
  });

  it('honours a caller-supplied window', () => {
    const initData = validInitData({ auth_date: nowSec - 120 });
    expect(
      verifyTelegramInitData(initData, { botToken: BOT_TOKEN, nowMs: NOW_MS, maxAgeSec: 60 })
    ).toEqual({ ok: false, code: AUTH_CODES.expired });
    expect(
      verifyTelegramInitData(initData, { botToken: BOT_TOKEN, nowMs: NOW_MS, maxAgeSec: 300 })
    ).toEqual({ ok: true, userId: '42' });
  });

  it('tolerates a clock a few minutes ahead but not a date from the far future', () => {
    const slightlyAhead = validInitData({ auth_date: nowSec + 60 });
    expect(verifyTelegramInitData(slightlyAhead, { botToken: BOT_TOKEN, nowMs: NOW_MS })).toEqual({
      ok: true,
      userId: '42',
    });
    const farFuture = validInitData({ auth_date: nowSec + 24 * 60 * 60 });
    expect(verifyTelegramInitData(farFuture, { botToken: BOT_TOKEN, nowMs: NOW_MS })).toEqual({
      ok: false,
      code: AUTH_CODES.invalid,
    });
  });

  it('rejects a missing, unparsable or non-numeric auth_date', () => {
    for (const overrides of [{ auth_date: '' }, { auth_date: 'вчора' }, { auth_date: 0 }]) {
      expect(verifyTelegramInitData(validInitData(overrides), {
        botToken: BOT_TOKEN,
        nowMs: NOW_MS,
      })).toEqual({ ok: false, code: AUTH_CODES.invalid });
    }
  });

  it('rejects empty input, a missing hash and a missing user', () => {
    for (const raw of ['', '   ', null, undefined, 42, 'user=%7B%7D&auth_date=1']) {
      expect(verifyTelegramInitData(raw, { botToken: BOT_TOKEN, nowMs: NOW_MS })).toEqual({
        ok: false,
        code: AUTH_CODES.invalid,
      });
    }
    const noUser = signTelegramInitData({ auth_date: nowSec, query_id: 'AAF' }, BOT_TOKEN);
    expect(verifyTelegramInitData(noUser, { botToken: BOT_TOKEN, nowMs: NOW_MS })).toEqual({
      ok: false,
      code: AUTH_CODES.invalid,
    });
  });

  it('rejects a signed payload whose user has no id', () => {
    for (const user of ['not json', JSON.stringify({ first_name: 'Bodya' }), JSON.stringify({ id: '' })]) {
      expect(verifyTelegramInitData(validInitData({ user }), {
        botToken: BOT_TOKEN,
        nowMs: NOW_MS,
      })).toEqual({ ok: false, code: AUTH_CODES.invalid });
    }
  });
});

describe('hashesMatch', () => {
  it('matches identical strings and rejects differing or differently sized ones', () => {
    expect(hashesMatch('abc123', 'abc123')).toBe(true);
    expect(hashesMatch('abc123', 'abc124')).toBe(false);
    // Різна довжина не має кидати виняток — timingSafeEqual сам по собі кидає.
    expect(hashesMatch('abc', 'abcdef')).toBe(false);
    expect(hashesMatch('', '')).toBe(true);
  });
});
