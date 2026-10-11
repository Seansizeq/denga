import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attemptWithCloudModel, isCloudModelEnabled } from './smart-transaction-cloud.js';

const categories = [
  { id: 'cafe', name: 'Кафе', type: 'expense' },
  { id: 'salary', name: 'Зарплата', type: 'income' },
];

const answer = (payload) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
});

const goodPayload = {
  is_transaction: true,
  type: 'expense',
  amount: 55,
  currency: 'UAH',
  date: '2026-10-11',
  category_id: 'cafe',
  account_key: '',
  note: 'кава',
};

const call = () => attemptWithCloudModel({ text: 'кава 55', categories, today: '2026-10-11' });

const sentBody = (fetchMock) => JSON.parse(fetchMock.mock.calls[0][1].body);

let saved;
beforeEach(() => {
  saved = { ...process.env };
  process.env.CLOUD_LLM_URL = 'https://openrouter.ai/api';
  process.env.CLOUD_LLM_API_KEY = 'sk-test';
  process.env.CLOUD_LLM_MODEL = 'anthropic/claude-haiku-5.5';
  delete process.env.CLOUD_LLM_REASONING_EFFORT;
  // The local provider's settings live next door and must not leak in.
  process.env.LOCAL_LLM_URL = 'http://127.0.0.1:1234';
  process.env.LOCAL_LLM_MODEL = 'denga-qwen';
  process.env.LOCAL_LLM_REASONING_EFFORT = 'none';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  process.env = saved;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isCloudModelEnabled', () => {
  /** Без ключа кожен виклик — це 401, який усе одно з'їдає денний слот. */
  it('needs both the URL and the key', () => {
    expect(isCloudModelEnabled()).toBe(true);
    delete process.env.CLOUD_LLM_API_KEY;
    expect(isCloudModelEnabled()).toBe(false);
    process.env.CLOUD_LLM_API_KEY = 'sk-test';
    delete process.env.CLOUD_LLM_URL;
    expect(isCloudModelEnabled()).toBe(false);
  });
});

describe('attemptWithCloudModel', () => {
  it('does not call anything without a key', async () => {
    delete process.env.CLOUD_LLM_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).resolves.toEqual({ result: null, reached: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads its own settings, not the local model ones', async () => {
    const fetchMock = vi.fn(async () => answer(goodPayload));
    vi.stubGlobal('fetch', fetchMock);
    const { result, reached } = await call();
    expect(reached).toBe(true);
    expect(result).toMatchObject({ isTransaction: true, amount: 55, categoryId: 'cafe' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer sk-test');
    const body = sentBody(fetchMock);
    expect(body.model).toBe('anthropic/claude-haiku-5.5');
  });

  /**
   * Сама по собі Haiku 5.5 вирішує «подумати» й на справжньому списку категорій
   * витрачала 200 токенів до кінця JSON: відповідь обривалась, людина бачила тишу.
   */
  it('turns reasoning off and leaves room for the answer by default', async () => {
    const fetchMock = vi.fn(async () => answer(goodPayload));
    vi.stubGlobal('fetch', fetchMock);
    await call();
    const body = sentBody(fetchMock);
    expect(body.reasoning_effort).toBe('none');
    expect(body.max_tokens).toBeGreaterThanOrEqual(1024);
  });

  /** Claude Haiku 5.5 відхиляє будь-яку температуру, крім типової. */
  it('leaves temperature to the server', async () => {
    const fetchMock = vi.fn(async () => answer(goodPayload));
    vi.stubGlobal('fetch', fetchMock);
    await call();
    expect('temperature' in sentBody(fetchMock)).toBe(false);
  });

  /** OpenRouter показує базову адресу вже з /v1 — саме її й вставляють. */
  it('accepts a base URL pasted with /v1 on the end', async () => {
    process.env.CLOUD_LLM_URL = 'https://openrouter.ai/api/v1/';
    const fetchMock = vi.fn(async () => answer(goodPayload));
    vi.stubGlobal('fetch', fetchMock);
    await call();
    expect(fetchMock.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('passes the reasoning effort through when one is set', async () => {
    process.env.CLOUD_LLM_REASONING_EFFORT = 'low';
    const fetchMock = vi.fn(async () => answer(goodPayload));
    vi.stubGlobal('fetch', fetchMock);
    await call();
    expect(sentBody(fetchMock).reasoning_effort).toBe('low');
  });

  it('counts an error answer as reached, and a dropped connection as not', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 402, text: async () => 'no credits' })));
    await expect(call()).resolves.toEqual({ result: null, reached: true });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ENOTFOUND'); }));
    await expect(call()).resolves.toEqual({ result: null, reached: false });
  });
});
