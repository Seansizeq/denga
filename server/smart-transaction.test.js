import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { geminiParse, geminiEnabled, localParse, localEnabled } = vi.hoisted(() => ({
  geminiParse: vi.fn(),
  geminiEnabled: vi.fn(),
  localParse: vi.fn(),
  localEnabled: vi.fn(),
}));

vi.mock('./smart-transaction-gemini.js', () => ({
  attemptWithGemini: geminiParse,
  isGeminiEnabled: geminiEnabled,
}));
vi.mock('./smart-transaction-local.js', () => ({
  attemptWithLocalModel: localParse,
  isLocalModelEnabled: localEnabled,
}));

const {
  DEFAULT_PROVIDER,
  attemptSmartTransaction,
  isSmartTransactionEnabled,
  parseSmartTransaction,
  resolveFallbackNames,
  resolveProviderName,
} = await import('./smart-transaction.js');

/** Провайдер відповів результатом. */
const answered = (note) => ({ result: { isTransaction: true, note }, reached: true });
/** Провайдер відповів, але користі з відповіді нема (зіпсований JSON, 500). */
const answeredNothing = () => ({ result: null, reached: true });
/** Запит нікуди не доїхав: порт закритий, машина спить. */
const unreachable = () => ({ result: null, reached: false });

const categories = [{ id: 'cafe', name: 'Кафе', type: 'expense' }];
const call = (overrides = {}) => parseSmartTransaction({ text: 'кава 55', categories, ...overrides });

let savedEnv;
beforeEach(() => {
  savedEnv = {
    provider: process.env.SMART_TRANSACTION_PROVIDER,
    fallback: process.env.SMART_TRANSACTION_FALLBACK,
  };
  delete process.env.SMART_TRANSACTION_PROVIDER;
  delete process.env.SMART_TRANSACTION_FALLBACK;
  geminiParse.mockReset().mockResolvedValue(answered('from gemini'));
  localParse.mockReset().mockResolvedValue(answered('from local'));
  geminiEnabled.mockReset().mockReturnValue(true);
  localEnabled.mockReset().mockReturnValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  const restore = (key, value) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore('SMART_TRANSACTION_PROVIDER', savedEnv.provider);
  restore('SMART_TRANSACTION_FALLBACK', savedEnv.fallback);
  vi.restoreAllMocks();
});

describe('resolveProviderName', () => {
  /** Незадана змінна має означати рівно те, що робив застосунок досі. */
  it('treats an unset value as the default provider', () => {
    expect(resolveProviderName(undefined)).toBe(DEFAULT_PROVIDER);
    expect(resolveProviderName('')).toBe(DEFAULT_PROVIDER);
    expect(resolveProviderName('   ')).toBe(DEFAULT_PROVIDER);
  });

  it('accepts a known name in any case, with stray spaces', () => {
    expect(resolveProviderName('local')).toBe('local');
    expect(resolveProviderName(' LOCAL ')).toBe('local');
    expect(resolveProviderName('Gemini')).toBe('gemini');
  });

  /**
   * Друкарська помилка не має тихо повертати до типового провайдера: людина,
   * що писала `lokal`, саме й хотіла, щоб текст її витрат не їхав у Google.
   */
  it('returns null for an unknown name instead of falling back', () => {
    expect(resolveProviderName('lokal')).toBeNull();
    expect(resolveProviderName('openai')).toBeNull();
  });
});

describe('parseSmartTransaction', () => {
  it('goes to Gemini when nothing is configured', async () => {
    await expect(call()).resolves.toMatchObject({ note: 'from gemini' });
    expect(geminiParse).toHaveBeenCalledTimes(1);
    expect(localParse).not.toHaveBeenCalled();
  });

  it('goes to the local model when asked to', async () => {
    process.env.SMART_TRANSACTION_PROVIDER = 'local';
    await expect(call()).resolves.toMatchObject({ note: 'from local' });
    expect(localParse).toHaveBeenCalledTimes(1);
    expect(geminiParse).not.toHaveBeenCalled();
  });

  it('calls nobody when the provider name is a typo', async () => {
    process.env.SMART_TRANSACTION_PROVIDER = 'lokal';
    await expect(call()).resolves.toBeNull();
    expect(geminiParse).not.toHaveBeenCalled();
    expect(localParse).not.toHaveBeenCalled();
  });

  it('calls nobody when the selected provider is not configured', async () => {
    process.env.SMART_TRANSACTION_PROVIDER = 'local';
    localEnabled.mockReturnValue(false);
    await expect(call()).resolves.toBeNull();
    expect(localParse).not.toHaveBeenCalled();
    // І точно не підмінює його увімкненим сусідом.
    expect(geminiParse).not.toHaveBeenCalled();
  });

  it('does not spend a call on input that cannot be a transaction', async () => {
    await expect(call({ text: '' })).resolves.toBeNull();
    await expect(call({ categories: [] })).resolves.toBeNull();
    await expect(call({ categories: undefined })).resolves.toBeNull();
    expect(geminiParse).not.toHaveBeenCalled();
  });

  it('passes the defaults the provider expects', async () => {
    await call();
    expect(geminiParse).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'кава 55',
        categories,
        accounts: [],
        defaultCurrency: 'UAH',
        today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      })
    );
  });
});

describe('resolveFallbackNames', () => {
  /** Мовчазний відкат у Google звів би нанівець сам сенс вибору `local`. */
  it('is empty unless someone asked for it', () => {
    expect(resolveFallbackNames(undefined, 'local')).toEqual([]);
    expect(resolveFallbackNames('', 'local')).toEqual([]);
    expect(resolveFallbackNames('   ', 'local')).toEqual([]);
  });

  it('reads a comma-separated list, in order', () => {
    expect(resolveFallbackNames('gemini', 'local')).toEqual(['gemini']);
    expect(resolveFallbackNames(' GEMINI , local ', 'local')).toEqual(['gemini']);
  });

  it('never lists the primary provider or a duplicate', () => {
    expect(resolveFallbackNames('local,gemini,gemini', 'local')).toEqual(['gemini']);
  });

  /** Назва, якої немає серед провайдерів, нікуди дані не відправить. */
  it('drops an unknown name but keeps the rest of the list working', () => {
    expect(resolveFallbackNames('gemma,gemini', 'local')).toEqual(['gemini']);
  });
});

describe('parseSmartTransaction with a fallback configured', () => {
  beforeEach(() => {
    process.env.SMART_TRANSACTION_PROVIDER = 'local';
    process.env.SMART_TRANSACTION_FALLBACK = 'gemini';
  });

  it('does not touch the fallback while the primary answers', async () => {
    await expect(call()).resolves.toMatchObject({ note: 'from local' });
    expect(geminiParse).not.toHaveBeenCalled();
  });

  /** Той самий випадок, що ловили на проді: LM Studio вимкнена. */
  it('asks the fallback when the primary cannot be reached', async () => {
    localParse.mockResolvedValue(unreachable());
    await expect(call()).resolves.toMatchObject({ note: 'from gemini' });
    expect(localParse).toHaveBeenCalledTimes(1);
    expect(geminiParse).toHaveBeenCalledTimes(1);
  });

  it('asks the fallback when the primary answers with nothing usable', async () => {
    localParse.mockResolvedValue(answeredNothing());
    await expect(call()).resolves.toMatchObject({ note: 'from gemini' });
    expect(geminiParse).toHaveBeenCalledTimes(1);
  });

  /**
   * «Це не транзакція» — теж відповідь. Питати про неї ще й запасного означало б
   * платити двічі за те саме «ні» й відправляти назовні звичайне листування.
   */
  it('stops at a primary that says the text is not a transaction', async () => {
    localParse.mockResolvedValue({ result: { isTransaction: false }, reached: true });
    await expect(call()).resolves.toEqual({ isTransaction: false });
    expect(geminiParse).not.toHaveBeenCalled();
  });

  it('skips a fallback that is not configured', async () => {
    localParse.mockResolvedValue(unreachable());
    geminiEnabled.mockReturnValue(false);
    await expect(call()).resolves.toBeNull();
    expect(geminiParse).not.toHaveBeenCalled();
  });

  it('still calls the fallback when the primary itself is not configured', async () => {
    localEnabled.mockReturnValue(false);
    await expect(call()).resolves.toMatchObject({ note: 'from gemini' });
    expect(localParse).not.toHaveBeenCalled();
  });

  /** Помилка в назві основного глушить усе — запасний не рятує друкарську помилку. */
  it('calls nobody when the primary name is a typo', async () => {
    process.env.SMART_TRANSACTION_PROVIDER = 'lokal';
    await expect(call()).resolves.toBeNull();
    expect(localParse).not.toHaveBeenCalled();
    expect(geminiParse).not.toHaveBeenCalled();
  });
});

describe('attemptSmartTransaction reports whether anyone was reached', () => {
  const attempt = () => attemptSmartTransaction({ text: 'кава 55', categories });

  it('is reached when a provider answered', async () => {
    await expect(attempt()).resolves.toMatchObject({ reached: true });
  });

  /** Саме на цьому тримається повернення денної квоти. */
  it('is not reached when the only provider is unreachable', async () => {
    process.env.SMART_TRANSACTION_PROVIDER = 'local';
    localParse.mockResolvedValue(unreachable());
    await expect(attempt()).resolves.toEqual({ result: null, reached: false });
  });

  it('is reached when the fallback answered after an unreachable primary', async () => {
    process.env.SMART_TRANSACTION_PROVIDER = 'local';
    process.env.SMART_TRANSACTION_FALLBACK = 'gemini';
    localParse.mockResolvedValue(unreachable());
    geminiParse.mockResolvedValue(answeredNothing());
    await expect(attempt()).resolves.toEqual({ result: null, reached: true });
  });

  it('is not reached when nothing is configured at all', async () => {
    geminiEnabled.mockReturnValue(false);
    await expect(attempt()).resolves.toEqual({ result: null, reached: false });
  });

  it('is not reached when there was nothing worth asking about', async () => {
    await expect(attemptSmartTransaction({ text: '', categories })).resolves.toEqual({
      result: null,
      reached: false,
    });
  });
});

describe('isSmartTransactionEnabled', () => {
  it('reports on the selected provider, not on whichever one is configured', () => {
    process.env.SMART_TRANSACTION_PROVIDER = 'local';
    localEnabled.mockReturnValue(false);
    geminiEnabled.mockReturnValue(true);
    expect(isSmartTransactionEnabled()).toBe(false);

    localEnabled.mockReturnValue(true);
    expect(isSmartTransactionEnabled()).toBe(true);
  });

  /** З увімкненим запасним фіча жива, поки живий хоч хтось у ланцюгу. */
  it('counts a configured fallback', () => {
    process.env.SMART_TRANSACTION_PROVIDER = 'local';
    process.env.SMART_TRANSACTION_FALLBACK = 'gemini';
    localEnabled.mockReturnValue(false);
    geminiEnabled.mockReturnValue(true);
    expect(isSmartTransactionEnabled()).toBe(true);

    geminiEnabled.mockReturnValue(false);
    expect(isSmartTransactionEnabled()).toBe(false);
  });

  it('is false for an unknown provider name', () => {
    process.env.SMART_TRANSACTION_PROVIDER = 'nope';
    expect(isSmartTransactionEnabled()).toBe(false);
  });
});
