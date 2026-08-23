import { describe, expect, it } from 'vitest';
import {
  isLocalhostOrigin,
  isOriginAllowed,
  isSameOriginRequest,
  parseAllowedOrigins,
} from './cors-policy.js';

const PROD_HOST = 'denga.vibelearn.site';

describe('isOriginAllowed', () => {
  /**
   * Головна причина існування модуля: незаданий `CORS_ORIGINS` більше не
   * означає «пускати всіх». Забути налаштувати список має бути суворіше, а не
   * м'якше.
   */
  it('denies a foreign origin when no list is configured', () => {
    expect(
      isOriginAllowed({ origin: 'https://evil.example', requestHost: PROD_HOST, allowedOrigins: [] })
    ).toBe(false);
  });

  /**
   * І одразу друга половина тієї ж зміни: свій фронтенд не в списку, і без
   * збігу хоста суворість зламала б кожен POST у бою.
   */
  it('allows the app talking to its own host without any configuration', () => {
    expect(
      isOriginAllowed({ origin: `https://${PROD_HOST}`, requestHost: PROD_HOST, allowedOrigins: [] })
    ).toBe(true);
  });

  it('allows an origin listed explicitly', () => {
    expect(
      isOriginAllowed({
        origin: 'https://admin.example',
        requestHost: PROD_HOST,
        allowedOrigins: ['https://admin.example'],
      })
    ).toBe(true);
  });

  it('allows a request that carries no Origin at all', () => {
    expect(isOriginAllowed({ origin: undefined, requestHost: PROD_HOST })).toBe(true);
    expect(isOriginAllowed({ origin: '', requestHost: PROD_HOST })).toBe(true);
  });

  it('allows localhost only outside production', () => {
    const origin = 'http://localhost:5173';
    expect(isOriginAllowed({ origin, requestHost: 'localhost:3001', allowedOrigins: [], isProduction: false })).toBe(true);
    expect(isOriginAllowed({ origin, requestHost: PROD_HOST, allowedOrigins: [], isProduction: true })).toBe(false);
  });

  /** Ліворуч від крапки в підробленому домені може стояти що завгодно. */
  it('does not fall for an origin that merely contains the host', () => {
    expect(
      isOriginAllowed({ origin: `https://${PROD_HOST}.evil.example`, requestHost: PROD_HOST })
    ).toBe(false);
    expect(
      isOriginAllowed({ origin: `https://evil.example/?x=${PROD_HOST}`, requestHost: PROD_HOST })
    ).toBe(false);
  });
});

describe('isSameOriginRequest', () => {
  it('compares host and port, not just the domain', () => {
    expect(isSameOriginRequest('localhost:3001', 'http://localhost:3001')).toBe(true);
    expect(isSameOriginRequest('localhost:3001', 'http://localhost:5173')).toBe(false);
  });

  it('is case-insensitive about the host', () => {
    expect(isSameOriginRequest('Denga.Example', 'https://denga.example')).toBe(true);
  });

  it('returns false for garbage instead of throwing', () => {
    expect(isSameOriginRequest('denga.example', 'not-a-url')).toBe(false);
    expect(isSameOriginRequest('', 'https://denga.example')).toBe(false);
  });
});

describe('isLocalhostOrigin', () => {
  it('recognises the loopback spellings and nothing else', () => {
    expect(isLocalhostOrigin('http://localhost:5173')).toBe(true);
    expect(isLocalhostOrigin('http://127.0.0.1:3001')).toBe(true);
    expect(isLocalhostOrigin('http://[::1]:3001')).toBe(true);
    expect(isLocalhostOrigin('https://localhost')).toBe(true);
    expect(isLocalhostOrigin('https://localhost.evil.example')).toBe(false);
    expect(isLocalhostOrigin('https://notlocalhost')).toBe(false);
  });
});

describe('parseAllowedOrigins', () => {
  it('splits on commas and drops blanks', () => {
    expect(parseAllowedOrigins(' https://a.example , ,https://b.example ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});
