import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLocalModelEnabled, parseModelJson, parseWithLocalModel } from './smart-transaction-local.js';

const categories = [
  { id: 'cafe', name: 'Кафе', type: 'expense' },
  { id: 'salary', name: 'Зарплата', type: 'income' },
];
const accounts = [{ accountKey: 'cash_uah', name: 'Готівка' }];

const answer = (payload) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
});

const goodPayload = {
  is_transaction: true,
  type: 'expense',
  amount: 55,
  currency: 'UAH',
  date: '2026-08-23',
  category_id: 'cafe',
  account_key: '',
  note: 'кава',
};

const call = (overrides = {}) =>
  parseWithLocalModel({ text: 'кава 55', categories, accounts, today: '2026-08-23', ...overrides });

const sentBody = (fetchMock) => JSON.parse(fetchMock.mock.calls[0][1].body);

let saved;
beforeEach(() => {
  saved = { ...process.env };
  process.env.LOCAL_LLM_URL = 'http://127.0.0.1:8080';
  delete process.env.LOCAL_LLM_API_KEY;
  delete process.env.LOCAL_LLM_MODEL;
  delete process.env.LOCAL_LLM_REASONING_EFFORT;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  process.env = saved;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isLocalModelEnabled', () => {
  it('follows LOCAL_LLM_URL', () => {
    expect(isLocalModelEnabled()).toBe(true);
    delete process.env.LOCAL_LLM_URL;
    expect(isLocalModelEnabled()).toBe(false);
    process.env.LOCAL_LLM_URL = '   ';
    expect(isLocalModelEnabled()).toBe(false);
  });
});

describe('parseWithLocalModel', () => {
  it('does not call anything when no URL is configured', async () => {
    delete process.env.LOCAL_LLM_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes a good answer through the shared validator', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(goodPayload)));
    await expect(call()).resolves.toMatchObject({
      isTransaction: true,
      amount: 55,
      categoryId: 'cafe',
      date: '2026-08-23',
      note: 'кава',
    });
  });

  it('still refuses a category the model invented', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer({ ...goodPayload, category_id: 'yacht' })));
    await expect(call()).resolves.toEqual({ isTransaction: false });
  });

  it('constrains category_id to the ids that were passed', async () => {
    const fetchMock = vi.fn(async () => answer(goodPayload));
    vi.stubGlobal('fetch', fetchMock);
    await call();
    const body = sentBody(fetchMock);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.schema.properties.category_id.enum).toEqual(['cafe', 'salary']);
    expect(body.temperature).toBe(0);
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('can disable hidden reasoning for extraction models', async () => {
    process.env.LOCAL_LLM_REASONING_EFFORT = 'none';
    const fetchMock = vi.fn(async () => answer(goodPayload));
    vi.stubGlobal('fetch', fetchMock);
    await call();
    expect(sentBody(fetchMock).reasoning_effort).toBe('none');
  });

  /**
   * У шаблоні Gemma ролі system немає взагалі. Промпт має їхати першим ходом
   * користувача — так розуміє кожен шаблон, а не лише декотрі.
   */
  it('folds the instructions into the user turn instead of a system message', async () => {
    const fetchMock = vi.fn(async () => answer(goodPayload));
    vi.stubGlobal('fetch', fetchMock);
    await call();
    const { messages } = sentBody(fetchMock);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('id="cafe"');
    expect(messages[0].content).toContain('кава 55');
  });

  it('sends a bearer token only when one is configured', async () => {
    const fetchMock = vi.fn(async () => answer(goodPayload));
    vi.stubGlobal('fetch', fetchMock);
    await call();
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBeUndefined();

    process.env.LOCAL_LLM_API_KEY = 'denga-local';
    await call();
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe('Bearer denga-local');
  });

  it('tolerates a trailing slash on the configured URL', async () => {
    process.env.LOCAL_LLM_URL = 'http://127.0.0.1:8080///';
    const fetchMock = vi.fn(async () => answer(goodPayload));
    vi.stubGlobal('fetch', fetchMock);
    await call();
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8080/v1/chat/completions');
  });

  /** Ноутбук заснув, сервер не піднято, модель вивантажена — для викликача це одне й те саме. */
  it('returns null when the server errors or cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, text: async () => 'loading' })));
    await expect(call()).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    await expect(call()).resolves.toBeNull();
  });

  it('returns null when the answer is not usable JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'не знаю' } }] }) })));
    await expect(call()).resolves.toBeNull();
  });
});

describe('parseModelJson', () => {
  it('reads plain JSON', () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
  });

  /** «OpenAI-сумісний» — це сімейна схожість, а не специфікація. */
  it('reads JSON that arrived wrapped in a markdown fence', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('ось відповідь:\n```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('returns null for anything that is not an object', () => {
    expect(parseModelJson('не json')).toBeNull();
    expect(parseModelJson('42')).toBeNull();
    expect(parseModelJson('"рядок"')).toBeNull();
  });
});
