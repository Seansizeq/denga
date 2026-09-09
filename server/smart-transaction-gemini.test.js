import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const categories = [
  { id: 'cafe', name: 'Кафе', type: 'expense' },
  { id: 'salary', name: 'Зарплата', type: 'income' },
];

const call = async (attemptWithGemini, overrides = {}) =>
  attemptWithGemini({ text: 'кава 55', categories, today: '2026-09-09', ...overrides });

/** Свіжий модуль на кожен тест: холодні від моделей живуть у його памʼяті. */
const freshProvider = async () => {
  vi.resetModules();
  return import('./smart-transaction-gemini.js');
};

const okAnswer = (payload) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
});

const rateLimited = (message) => ({
  ok: false,
  status: 429,
  json: async () => ({ error: { code: 429, message, status: 'RESOURCE_EXHAUSTED' } }),
  text: async () => message,
});

const goodPayload = {
  is_transaction: true,
  type: 'expense',
  amount: 55,
  currency: 'UAH',
  date: '2026-09-09',
  category_id: 'cafe',
  account_key: '',
  note: 'кава',
};

let saved;
beforeEach(() => {
  saved = { ...process.env };
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_MODELS = 'model-a,model-b,model-c';
  delete process.env.GEMINI_MODEL;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  process.env = saved;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('attemptWithGemini', () => {
  it('does not call anything without a key', async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { attemptWithGemini } = await freshProvider();

    await expect(call(attemptWithGemini)).resolves.toEqual({ result: null, reached: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the parsed transaction from the first model that answers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okAnswer(goodPayload));
    vi.stubGlobal('fetch', fetchMock);
    const { attemptWithGemini } = await freshProvider();

    await expect(call(attemptWithGemini)).resolves.toMatchObject({
      reached: true,
      result: { isTransaction: true, amount: 55, categoryId: 'cafe', type: 'expense' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('moves to the next model when one is rate-limited', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited('Quota exceeded for requests per minute'))
      .mockResolvedValueOnce(okAnswer(goodPayload));
    vi.stubGlobal('fetch', fetchMock);
    const { attemptWithGemini } = await freshProvider();

    await expect(call(attemptWithGemini)).resolves.toMatchObject({ reached: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /**
   * Порожній баланс — властивість ключа, не моделі. Обхід усього ланцюга дав би
   * ту саму відмову ціною ще пʼяти запитів на кожному розборі.
   */
  it('stops after one call when the key itself is out of credits', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(rateLimited('Your prepayment credits are depleted. Please go to AI Studio'));
    vi.stubGlobal('fetch', fetchMock);
    const { attemptWithGemini } = await freshProvider();

    await expect(call(attemptWithGemini)).resolves.toEqual({ result: null, reached: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the whole chain cold after that, instead of retrying every model', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(rateLimited('Your prepayment credits are depleted.'));
    vi.stubGlobal('fetch', fetchMock);
    const { attemptWithGemini } = await freshProvider();

    await call(attemptWithGemini);
    await call(attemptWithGemini);
    // Друга спроба бере лише одну модель — не три.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /** Ознака, на якій тримається повернення денної квоти користувачу. */
  it('reports that nothing was reached when the request never left', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    vi.stubGlobal('fetch', fetchMock);
    const { attemptWithGemini } = await freshProvider();

    await expect(call(attemptWithGemini)).resolves.toEqual({ result: null, reached: false });
  });

  it('reports a service that answered, even when the answer was useless', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });
    vi.stubGlobal('fetch', fetchMock);
    const { attemptWithGemini } = await freshProvider();

    await expect(call(attemptWithGemini)).resolves.toEqual({ result: null, reached: true });
  });
});
