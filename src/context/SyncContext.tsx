import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Transaction } from '../types';
import { apiFetch } from '../api/client';
import { normalizeDenomination } from '../utils/denomination';
import { usePersistedState } from '../hooks/usePersistedState';
import { POLL_INTERVAL_MS, backoffDelayMs } from '../utils/backoff';

/**
 * Одне джерело для транзакцій і рахунків.
 *
 * Досі два контексти опитували два маршрути кожні пʼять секунд незалежно один
 * від одного, і щоразу отримували все заново. Тепер запит один — `/api/sync` —
 * і він відповідає порожнім 304, коли нічого не змінилося.
 *
 * `TransactionProvider` і `PortfolioProvider` лишилися на місці й зберегли свої
 * інтерфейси: вони стали тонкими обгортками над цим джерелом. Так тринадцять
 * екранів і хуків, що ними користуються, не довелося чіпати взагалі — а це
 * тринадцять можливостей щось зламати, яких ми уникли.
 */

/** Ті самі ключі, що й раніше: кеш наявних користувачів переживає оновлення. */
const TRANSACTIONS_STORAGE_KEY = 'denga_transactions_v1';
/** Скільки транзакцій віддає знімок — має збігатися з сервером. */
const SNAPSHOT_LIMIT = 500;
const HISTORY_PAGE_SIZE = 500;
const MAX_HISTORY_PAGES = 40;
/**
 * Скільки рядків одразу за знімком перечитується, коли знімок змінився.
 *
 * Знімок — це завжди найновіші 500. Новий запис зсуває вікно, і найстаріший
 * рядок знімка випадав із нього — а в дотягнутій історії його не було, бо на
 * момент дотягування він лежав у знімку. Перечитаний відрізок закриває цю
 * щілину. Щоб його не вистачило, між двома тактами мало б зʼявитися стільки
 * записів — тоді історія просто дотягується наново.
 */
const BOUNDARY_PAGE_SIZE = 200;
const ACCOUNTS_STORAGE_KEY = 'denga_accounts_v1';

export type RawAccount = Record<string, unknown>;

const isTransactionArray = (v: unknown): v is Transaction[] =>
  Array.isArray(v) &&
  v.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      typeof (item as Transaction).id === 'string' &&
      typeof (item as Transaction).amount === 'number',
  );

const isRawAccountArray = (v: unknown): v is RawAccount[] =>
  Array.isArray(v) && v.every((row) => row && typeof row === 'object');

/** Валюта в базі — деномінація: може бути й активом, не лише фіатом. */
const normalizeTransaction = (row: unknown): Transaction => {
  const tx = row as Transaction & { currency?: string; transferToCurrency?: string };
  return {
    ...tx,
    currency: normalizeDenomination(tx.currency),
    transferToCurrency: tx.transferToCurrency ? normalizeDenomination(tx.transferToCurrency) : undefined,
  };
};

type SyncPayload = {
  transactions?: unknown;
  accounts?: unknown;
  hasMoreTransactions?: boolean;
};

type HistoryPage = { transactions?: unknown; hasMore?: boolean };

const readHistoryPage = async (limit: number, offset: number): Promise<{ rows: Transaction[]; hasMore: boolean } | null> => {
  const res = await apiFetch(`/api/transactions?limit=${limit}&offset=${offset}`);
  if (!res.ok) return null;
  const body = (await res.json()) as HistoryPage;
  return {
    rows: Array.isArray(body.transactions) ? body.transactions.map(normalizeTransaction) : [],
    hasMore: Boolean(body.hasMore),
  };
};

/** Уся історія, старіша за знімок, сторінками. null — не вдалося або перервано. */
const fetchOlderHistory = async (isCancelled: () => boolean): Promise<Transaction[] | null> => {
  const collected: Transaction[] = [];
  let offset = SNAPSHOT_LIMIT;
  // Стеля на випадок, якщо сервер завжди каже «є ще»: краще неповна
  // історія, ніж нескінченний цикл запитів.
  for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
    try {
      const result = await readHistoryPage(HISTORY_PAGE_SIZE, offset);
      if (!result || isCancelled()) return null;
      collected.push(...result.rows);
      if (!result.hasMore || result.rows.length === 0) break;
      offset += HISTORY_PAGE_SIZE;
    } catch (error) {
      console.error('Error loading older transactions:', error);
      return null;
    }
  }
  return isCancelled() ? null : collected;
};

interface SyncContextValue {
  transactions: Transaction[];
  accounts: RawAccount[];
  /** true — останній запит не вдався, на екрані кеш. */
  stale: boolean;
  /** false, поки не завершився перший запит: «даних немає» ≠ «ще вантажимо». */
  loaded: boolean;
  /** true — сервер має старіші транзакції, ніж уміщується в знімок. */
  hasMoreTransactions: boolean;
  /** false, поки старіші сторінки ще дотягуються у фоні. */
  historyComplete: boolean;
  /**
   * true — Telegram видав `initData` понад добу тому й сервер його більше не
   * приймає. Повторні запити тут не допоможуть: рядок не оновлюється, поки
   * застосунок не перевідкриють.
   */
  sessionExpired: boolean;
  /** Позачергове оновлення: після власного запису чекати такту немає сенсу. */
  refresh: () => Promise<void>;
  setTransactions: (next: Transaction[] | ((prev: Transaction[]) => Transaction[])) => void;
  /**
   * Правка, що має зачепити і знімок, і дотягнуту історію: редагування чи
   * видалення операції, яка може бути старшою за знімок. Через
   * `setTransactions` така правка лягала лише на знімок, і стара операція
   * лишалася на екрані як була до перезапуску.
   */
  editTransactions: (edit: (list: Transaction[]) => Transaction[]) => void;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode; onReady?: () => void }> = ({
  children,
  onReady,
}) => {
  const [transactions, setTransactions] = usePersistedState<Transaction[]>(
    TRANSACTIONS_STORAGE_KEY,
    [],
    { validate: isTransactionArray },
  );
  const [accounts, setAccounts] = usePersistedState<RawAccount[]>(
    ACCOUNTS_STORAGE_KEY,
    [],
    { validate: isRawAccountArray },
  );
  const [stale, setStale] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  /**
   * Історія, старіша за знімок.
   *
   * Знімок навмисно обмежений, щоб опитування кожні пʼять секунд не тягало всю
   * історію. Але статистика за рік має рахуватися по всьому, тож решта
   * дотягується **один раз за сесію**, сторінками, одразу після першого
   * знімка. Людина бачить свіже негайно, повнота приїжджає за мить.
   *
   * У localStorage це не кладеться свідомо: кілька тисяч транзакцій там
   * важать сотні кілобайт, а `usePersistedState` переписує ключ на кожну
   * зміну. Кеш знімка для першого екрана офлайн і так є.
   */
  const [olderTransactions, setOlderTransactions] = useState<Transaction[]>([]);
  const [historyComplete, setHistoryComplete] = useState(true);
  const backfillStartedRef = useRef(false);
  /**
   * Дотягнута історія як джерело правди для асинхронних кроків: зшивання
   * читає її одразу після `await`, коли стан ще міг не перемалюватися.
   * Стан — лише її відбиток для рендера.
   */
  const olderRef = useRef<Transaction[]>([]);
  /** true, коли історію дотягнуто, — лише тоді є що зшивати. */
  const olderLoadedRef = useRef(false);
  /** Останній знімок, яким відповів сервер, — щоб зшивати лише після змін. */
  const lastSnapshotRef = useRef<string | null>(null);
  const restitchRef = useRef({ running: false, again: false });

  /**
   * ETag живе лише в памʼяті, не в localStorage. Збережений разом із кешем, він
   * міг би з ним розійтися — сховище має право викинути дані й лишити ключ, і
   * тоді ми отримали б 304 на порожній кеш і показали б порожній гаманець як
   * свіжий. Ціна памʼятного варіанта — один повний запит на відкриття
   * застосунку; решта такту сесії йде порожніми 304.
   */
  const etagRef = useRef<string | null>(null);
  const failuresRef = useRef(0);
  /** Читається всередині вже запущеного циклу, тому ref, а не стан. */
  const expiredRef = useRef(false);
  const mountedRef = useRef(true);
  const readyNotifiedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const notifyReady = useCallback(() => {
    if (readyNotifiedRef.current) return;
    readyNotifiedRef.current = true;
    onReady?.();
  }, [onReady]);

  const replaceOlder = useCallback((next: Transaction[]) => {
    olderRef.current = next;
    setOlderTransactions(next);
  }, []);

  /**
   * Перечитати відрізок одразу за знімком і пришити до дотягнутої історії.
   *
   * Свіжий відрізок замінює початок історії до свого останнього рядка, решта
   * лишається як була. Так закривається щілина від записів, що зсунули вікно
   * знімка, і заразом підтягуються правки й видалення на цій межі. Якщо
   * останнього рядка відрізка в історії немає — зсув завеликий, історія
   * дотягується наново.
   */
  const restitchOlderHistory = useCallback(async () => {
    const state = restitchRef.current;
    if (state.running) {
      state.again = true;
      return;
    }
    state.running = true;
    try {
      do {
        state.again = false;
        if (!olderLoadedRef.current) return;
        const boundary = await readHistoryPage(BOUNDARY_PAGE_SIZE, SNAPSHOT_LIMIT);
        if (!boundary || !mountedRef.current) return;
        if (!boundary.hasMore) {
          // Відрізок — це вся історія за знімком.
          replaceOlder(boundary.rows);
          continue;
        }
        const lastId = boundary.rows.at(-1)?.id;
        const index = lastId ? olderRef.current.findIndex((tx) => tx.id === lastId) : -1;
        if (index === -1) {
          const all = await fetchOlderHistory(() => !mountedRef.current);
          if (all) replaceOlder(all);
          continue;
        }
        replaceOlder([...boundary.rows, ...olderRef.current.slice(index + 1)]);
      } while (state.again);
    } catch (error) {
      console.error('Error re-syncing older transactions:', error);
    } finally {
      state.running = false;
    }
  }, [replaceOlder]);

  /** @returns чи вдався запит — від цього залежить пауза до наступного. */
  const fetchSnapshot = useCallback(async (): Promise<boolean> => {
    try {
      const headers: Record<string, string> = {};
      if (etagRef.current) headers['If-None-Match'] = etagRef.current;
      const response = await apiFetch('/api/sync', { headers });

      // Нічого не змінилося: тіла немає, стан не чіпаємо, перерендеру теж.
      if (response.status === 304) {
        failuresRef.current = 0;
        if (mountedRef.current) setStale(false);
        return true;
      }
      // Протухлий `initData` — не збій мережі, а кінець сесії. Відрізнити
      // важливо: перше лікується повтором, друге — ні, і повторювати означало б
      // намарно навантажувати сервер із кожного відкритого екрана.
      if (response.status === 401) {
        const body = (await response.json().catch(() => null)) as { code?: string } | null;
        if (body?.code === 'AUTH_INIT_DATA_EXPIRED' && mountedRef.current) {
          expiredRef.current = true;
          setSessionExpired(true);
          return true;
        }
      }
      if (!response.ok) throw new Error(`sync ${response.status}`);

      const data = (await response.json()) as SyncPayload;
      const nextEtag = response.headers.get('ETag');
      if (nextEtag) etagRef.current = nextEtag;

      const nextTransactions = Array.isArray(data.transactions)
        ? data.transactions.map(normalizeTransaction)
        : [];
      const nextAccounts = isRawAccountArray(data.accounts) ? data.accounts : [];
      const hasMore = Boolean(data.hasMoreTransactions);
      // Повна відповідь приходить і тоді, коли змінились лише рахунки, тож
      // зшивати історію варто тільки після зміни самих транзакцій.
      const snapshotKey = JSON.stringify(nextTransactions);
      const transactionsChanged = lastSnapshotRef.current !== null && lastSnapshotRef.current !== snapshotKey;
      lastSnapshotRef.current = snapshotKey;

      failuresRef.current = 0;
      if (mountedRef.current) {
        setTransactions(nextTransactions);
        setAccounts(nextAccounts);
        setHasMoreTransactions(hasMore);
        setStale(false);
        if (!hasMore) {
          // Знімок і є вся історія: дотягнуте раніше могло лише застаріти. Якщо
          // історія колись знову переросте знімок, вона дотягнеться наново.
          olderLoadedRef.current = false;
          backfillStartedRef.current = false;
          replaceOlder([]);
          setHistoryComplete(true);
        } else if (transactionsChanged) {
          void restitchOlderHistory();
        }
      }
      return true;
    } catch (error) {
      console.error('Error syncing:', error);
      // Кеш лишається на екрані, але позначеним — інакше людина не відрізнить
      // старі суми від свіжих (див. банер стану даних).
      failuresRef.current += 1;
      // Наступний запит має піти повним: інакше 304 підтвердив би кеш, якого
      // ми могли не встигнути оновити.
      etagRef.current = null;
      if (mountedRef.current) setStale(true);
      return false;
    } finally {
      if (mountedRef.current) setLoaded(true);
      notifyReady();
    }
  }, [notifyReady, replaceOlder, restitchOlderHistory, setAccounts, setTransactions]);

  useEffect(() => {
    if (!hasMoreTransactions || backfillStartedRef.current) return;
    backfillStartedRef.current = true;
    setHistoryComplete(false);
    let cancelled = false;
    let completed = false;

    void (async () => {
      const collected = await fetchOlderHistory(() => cancelled);
      if (!collected) return;
      completed = true;
      replaceOlder(collected);
      olderLoadedRef.current = true;
      setHistoryComplete(true);
    })();

    return () => {
      cancelled = true;
      // Пробіг, обірваний розмонтуванням, за виконаний не рахується: інакше
      // прапорець лишався б піднятим, а дані так і не приїхали б. У StrictMode
      // React монтує ефекти двічі, тож перший пробіг обривається завжди.
      if (!completed) backfillStartedRef.current = false;
    };
  }, [hasMoreTransactions, replaceOlder]);

  /**
   * Знімок і дотягнута історія разом. Дедуплікація за id обовʼязкова: сторінки
   * беруться за зсувом, і новий запис під час дотягування зсуває решту на один
   * рядок — без неї сусідні сторінки дали б повтор.
   */
  const allTransactions = useMemo(() => {
    if (olderTransactions.length === 0) return transactions;
    const seen = new Set(transactions.map((t) => t.id));
    return [...transactions, ...olderTransactions.filter((t) => !seen.has(t.id))];
  }, [transactions, olderTransactions]);

  const refresh = useCallback(async () => {
    await fetchSnapshot();
  }, [fetchSnapshot]);

  const editTransactions = useCallback(
    (edit: (list: Transaction[]) => Transaction[]) => {
      setTransactions(edit);
      replaceOlder(edit(olderRef.current));
    },
    [setTransactions, replaceOlder],
  );

  /**
   * Такт опитування: засинає разом із застосунком і відступає, коли сервер
   * мовчить. `usePolling` тут не підходить — він має сталий інтервал і робить
   * запит одразу на кожну його зміну, тобто відступ перетворився б на свою
   * протилежність.
   */
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const clear = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const schedule = (ms: number) => {
      clear();
      timer = window.setTimeout(run, ms);
    };

    const run = async () => {
      if (cancelled || expiredRef.current) return;
      const ok = await fetchSnapshot();
      if (cancelled || expiredRef.current) return;
      // Від видимості залежить лише **планування наступного** запиту, а не
      // перший. Telegram цілком може відкрити застосунок у згорнутій вкладці —
      // і тоді перевірка на початку лишала б його назавжди без даних, бо подія
      // `visibilitychange` для вкладки, яка й не ставала видимою, не настане.
      if (document.hidden) return;
      schedule(ok ? POLL_INTERVAL_MS : backoffDelayMs(failuresRef.current));
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        clear();
        return;
      }
      // Повернулися до застосунку — свіжі дані потрібні негайно, а не за такт.
      void run();
    };

    void run();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      clear();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchSnapshot]);

  const value = useMemo<SyncContextValue>(
    () => ({
      transactions: allTransactions,
      accounts,
      stale,
      loaded,
      hasMoreTransactions,
      historyComplete,
      sessionExpired,
      refresh,
      setTransactions,
      editTransactions,
    }),
    [
      allTransactions,
      accounts,
      stale,
      loaded,
      hasMoreTransactions,
      historyComplete,
      sessionExpired,
      refresh,
      setTransactions,
      editTransactions,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export const useSync = (): SyncContextValue => {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within a SyncProvider');
  return ctx;
};
