import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { geminiParse, geminiEnabled, localParse, localEnabled } = vi.hoisted(() => ({
  geminiParse: vi.fn(),
  geminiEnabled: vi.fn(),
  localParse: vi.fn(),
  localEnabled: vi.fn(),
}));

vi.mock('./smart-transaction-gemini.js', () => ({
  parseWithGemini: geminiParse,
  isGeminiEnabled: geminiEnabled,
}));
vi.mock('./smart-transaction-local.js', () => ({
  parseWithLocalModel: localParse,
  isLocalModelEnabled: localEnabled,
}));

const {
  DEFAULT_PROVIDER,
  isSmartTransactionEnabled,
  parseSmartTransaction,
  resolveProviderName,
} = await import('./smart-transaction.js');

const categories = [{ id: 'cafe', name: 'Кафе', type: 'expense' }];
const call = (overrides = {}) => parseSmartTransaction({ text: 'кава 55', categories, ...overrides });

let savedProvider;
beforeEach(() => {
  savedProvider = process.env.SMART_TRANSACTION_PROVIDER;
  delete process.env.SMART_TRANSACTION_PROVIDER;
  geminiParse.mockReset().mockResolvedValue({ isTransaction: true, note: 'from gemini' });
  localParse.mockReset().mockResolvedValue({ isTransaction: true, note: 'from local' });
  geminiEnabled.mockReset().mockReturnValue(true);
  localEnabled.mockReset().mockReturnValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  if (savedProvider === undefined) delete process.env.SMART_TRANSACTION_PROVIDER;
  else process.env.SMART_TRANSACTION_PROVIDER = savedProvider;
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

describe('isSmartTransactionEnabled', () => {
  it('reports on the selected provider, not on whichever one is configured', () => {
    process.env.SMART_TRANSACTION_PROVIDER = 'local';
    localEnabled.mockReturnValue(false);
    geminiEnabled.mockReturnValue(true);
    expect(isSmartTransactionEnabled()).toBe(false);

    localEnabled.mockReturnValue(true);
    expect(isSmartTransactionEnabled()).toBe(true);
  });

  it('is false for an unknown provider name', () => {
    process.env.SMART_TRANSACTION_PROVIDER = 'nope';
    expect(isSmartTransactionEnabled()).toBe(false);
  });
});
