// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('../api/client', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { SyncProvider, useSync } = await import('./SyncContext');

/** Відповідь сервера, зібрана вручну: тестуємо контракт, а не бібліотеку fetch. */
const response = (
  status: number,
  body: unknown = null,
  headers: Record<string, string> = {},
): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null },
    json: async () => body,
  }) as unknown as Response;

const snapshot = (etag: string, txIds: string[], accountKeys: string[] = ['wallet']) =>
  response(
    200,
    {
      transactions: txIds.map((id) => ({ id, amount: 10, currency: 'UAH', type: 'expense', categoryId: 'food', date: '2026-09-06' })),
      accounts: accountKeys.map((accountKey) => ({ accountKey, primaryAmount: 100 })),
      hasMoreTransactions: false,
    },
    { etag },
  );

/**
 * Показує стан контексту й дає смикнути `refresh` із тесту.
 *
 * Значення публікується з ефекту, а не з рендера: присвоєння зовнішній змінній
 * під час рендера — саме та домішка, від якої застерігає правило
 * `react-hooks/globals`, і в React 19 з подвійним рендером вона ще й
 * виконалася б двічі.
 */
const held: { current: ReturnType<typeof useSync> | null } = { current: null };
const ctx = () => {
  if (!held.current) throw new Error('Probe ще не змонтований');
  return held.current;
};

const Probe: React.FC = () => {
  const value = useSync();
  React.useEffect(() => {
    held.current = value;
  });
  return (
    <div>
      <span data-testid="tx">{value.transactions.map((t) => t.id).join(',')}</span>
      <span data-testid="acc">{value.accounts.length}</span>
      <span data-testid="stale">{String(value.stale)}</span>
      <span data-testid="expired">{String(value.sessionExpired)}</span>
    </div>
  );
};

/**
 * Монтуємо так само, як `main.tsx` — у StrictMode. React навмисно виконує
 * ефекти двічі, і саме це впіймало помилку, через яку дотягування історії
 * вмикалося лише один раз і мовчки нічого не робило.
 */
const mount = () =>
  render(
    <React.StrictMode>
      <SyncProvider>
        <Probe />
      </SyncProvider>
    </React.StrictMode>,
  );

/** Заголовок `If-None-Match` останнього виклику, або null. */
const lastIfNoneMatch = (): string | null => {
  const call = apiFetch.mock.calls.at(-1);
  const headers = (call?.[1] as { headers?: Record<string, string> } | undefined)?.headers;
  return headers?.['If-None-Match'] ?? null;
};

beforeEach(() => {
  apiFetch.mockReset();
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Без setup-файлу автоприбирання не працює, і рендери накопичуються в
  // document.body — далі `getByTestId` знаходить елементи з чужих тестів.
  cleanup();
  held.current = null;
  vi.restoreAllMocks();
});

describe('SyncProvider', () => {
  it('перший запит наповнює транзакції й рахунки', async () => {
    apiFetch.mockResolvedValue(snapshot('W/"1-t1-a1"', ['a', 'b']));
    mount();

    await waitFor(() => expect(screen.getByTestId('tx').textContent).toBe('a,b'));
    expect(screen.getByTestId('acc').textContent).toBe('1');
    expect(screen.getByTestId('stale').textContent).toBe('false');
  });

  it('наступний запит несе ETag попереднього', async () => {
    apiFetch.mockResolvedValue(snapshot('W/"1-t1-a1"', ['a']));
    mount();
    await waitFor(() => expect(screen.getByTestId('tx').textContent).toBe('a'));
    // Перший запит іде без заголовка — порівнювати ще ні з чим.
    expect(apiFetch.mock.calls[0][1]?.headers).toEqual({});

    await act(async () => { await ctx().refresh(); });
    expect(lastIfNoneMatch()).toBe('W/"1-t1-a1"');
  });

  it('304 лишає дані на місці', async () => {
    apiFetch.mockResolvedValueOnce(snapshot('W/"1-t1-a1"', ['a', 'b']));
    mount();
    await waitFor(() => expect(screen.getByTestId('tx').textContent).toBe('a,b'));

    apiFetch.mockResolvedValue(response(304));
    await act(async () => { await ctx().refresh(); });

    expect(screen.getByTestId('tx').textContent).toBe('a,b');
    expect(screen.getByTestId('stale').textContent).toBe('false');
  });

  it('збій лишає кеш на екрані, але позначає його застарілим', async () => {
    apiFetch.mockResolvedValueOnce(snapshot('W/"1-t1-a1"', ['a']));
    mount();
    await waitFor(() => expect(screen.getByTestId('tx').textContent).toBe('a'));

    apiFetch.mockRejectedValue(new Error('мережа впала'));
    await act(async () => { await ctx().refresh(); });

    expect(screen.getByTestId('tx').textContent).toBe('a');
    expect(screen.getByTestId('stale').textContent).toBe('true');
  });

  it('після збою наступний запит іде повним, а не умовним', async () => {
    // Інакше 304 підтвердив би кеш, якого ми могли не встигнути оновити.
    apiFetch.mockResolvedValueOnce(snapshot('W/"1-t1-a1"', ['a']));
    mount();
    await waitFor(() => expect(screen.getByTestId('tx').textContent).toBe('a'));

    apiFetch.mockRejectedValueOnce(new Error('мережа впала'));
    await act(async () => { await ctx().refresh(); });

    apiFetch.mockResolvedValueOnce(snapshot('W/"1-t2-a1"', ['a', 'c']));
    await act(async () => { await ctx().refresh(); });

    expect(lastIfNoneMatch()).toBeNull();
    expect(screen.getByTestId('tx').textContent).toBe('a,c');
  });

  it('прострочена сесія розпізнається окремо від збою', async () => {
    apiFetch.mockResolvedValue(response(401, { code: 'AUTH_INIT_DATA_EXPIRED' }));
    mount();

    await waitFor(() => expect(screen.getByTestId('expired').textContent).toBe('true'));
    // Це не «сервер не відповідає»: показувати кнопку «оновити» тут було б брехнею.
    expect(screen.getByTestId('stale').textContent).toBe('false');
  });

  it('інший 401 лишається звичайним збоєм', async () => {
    apiFetch.mockResolvedValue(response(401, { code: 'AUTH_INVALID_TELEGRAM_INIT_DATA' }));
    mount();

    await waitFor(() => expect(screen.getByTestId('stale').textContent).toBe('true'));
    expect(screen.getByTestId('expired').textContent).toBe('false');
  });

  it('стартує з кешу, якщо сервер мовчить із самого початку', async () => {
    localStorage.setItem(
      'denga_transactions_v1',
      JSON.stringify({ data: [{ id: 'кеш', amount: 5, currency: 'UAH', type: 'expense', categoryId: 'food', date: '2026-09-01' }] }),
    );
    apiFetch.mockRejectedValue(new Error('офлайн'));
    mount();

    await waitFor(() => expect(screen.getByTestId('stale').textContent).toBe('true'));
    expect(screen.getByTestId('tx').textContent).toBe('кеш');
  });

  it('повідомляє про готовність навіть тоді, коли перший запит провалився', async () => {
    // Інакше заставка висіла б вічно в людини без мережі.
    const onReady = vi.fn();
    apiFetch.mockRejectedValue(new Error('офлайн'));
    render(<SyncProvider onReady={onReady}><Probe /></SyncProvider>);

    await waitFor(() => expect(onReady).toHaveBeenCalled());
  });
});

describe('згорнута вкладка', () => {
  const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  };

  afterEach(() => setHidden(false));

  it('завантажує дані навіть тоді, коли вкладку не показують', async () => {
    // Telegram цілком може відкрити застосунок у згорнутій вкладці. Доки
    // перевірка `document.hidden` стояла на початку циклу, такий застосунок
    // лишався порожнім назавжди: подія `visibilitychange` для вкладки, яка й
    // не ставала видимою, не настає.
    setHidden(true);
    apiFetch.mockResolvedValue(snapshot('W/"1-t1-a1"', ['a', 'b']));

    mount();

    await waitFor(() => expect(screen.getByTestId('tx').textContent).toBe('a,b'));
  });
});

describe('дотягування історії', () => {
  /** Знімок обмежений, тож статистика за рік має отримати решту окремо. */
  const page = (ids: string[], hasMore: boolean) =>
    response(200, {
      transactions: ids.map((id) => ({ id, amount: 1, currency: 'UAH', type: 'expense', categoryId: 'food', date: '2026-01-01' })),
      hasMore,
    });

  it('дотягує старіші сторінки після знімка й додає їх до списку', async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/api/sync')) {
        return Promise.resolve(
          response(200, {
            transactions: [{ id: 'свіжа', amount: 1, currency: 'UAH', type: 'expense', categoryId: 'food', date: '2026-09-06' }],
            accounts: [],
            hasMoreTransactions: true,
          }, { etag: 'W/"1-t1-a0"' }),
        );
      }
      if (path.includes('offset=500')) return Promise.resolve(page(['стара-1', 'стара-2'], true));
      if (path.includes('offset=1000')) return Promise.resolve(page(['стара-3'], false));
      return Promise.resolve(response(404));
    });

    mount();
    await waitFor(() => expect(screen.getByTestId('tx').textContent).toBe('свіжа,стара-1,стара-2,стара-3'));
  });

  it('не дублює запис, який зсунувся між сторінками', async () => {
    // Сторінки беруться за зсувом: новий запис під час дотягування зсуває
    // решту на рядок, і сусідні сторінки перекриваються.
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/api/sync')) {
        return Promise.resolve(
          response(200, {
            transactions: [{ id: 'a', amount: 1, currency: 'UAH', type: 'expense', categoryId: 'food', date: '2026-09-06' }],
            accounts: [],
            hasMoreTransactions: true,
          }, { etag: 'W/"1-t1-a0"' }),
        );
      }
      // Сервер віддає 'a' ще раз — вона зсунулася на другу сторінку.
      return Promise.resolve(page(['a', 'b'], false));
    });

    mount();
    await waitFor(() => expect(screen.getByTestId('tx').textContent).toBe('a,b'));
  });

  it('нічого не дотягує, коли вся історія вже в знімку', async () => {
    apiFetch.mockResolvedValue(snapshot('W/"1-t1-a1"', ['a']));
    mount();
    await waitFor(() => expect(screen.getByTestId('tx').textContent).toBe('a'));

    const pageCalls = apiFetch.mock.calls.filter(([p]) => String(p).includes('/api/transactions'));
    expect(pageCalls).toHaveLength(0);
  });

  it('збій на сторінці лишає те, що вже є, а не валить застосунок', async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/api/sync')) {
        return Promise.resolve(
          response(200, {
            transactions: [{ id: 'свіжа', amount: 1, currency: 'UAH', type: 'expense', categoryId: 'food', date: '2026-09-06' }],
            accounts: [],
            hasMoreTransactions: true,
          }, { etag: 'W/"1-t1-a0"' }),
        );
      }
      return Promise.reject(new Error('сторінка не приїхала'));
    });

    mount();
    await waitFor(() => expect(screen.getByTestId('tx').textContent).toBe('свіжа'));
    expect(screen.getByTestId('stale').textContent).toBe('false');
  });
});
