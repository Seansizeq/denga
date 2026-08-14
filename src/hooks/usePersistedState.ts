import { useCallback, useEffect, useState } from 'react';

type Updater<T> = T | ((prev: T) => T);

export interface UsePersistedStateOptions<T> {
  validate?: (raw: unknown) => raw is T;
  version?: number;
}

interface Envelope<T> {
  v?: number;
  data: T;
}

function readFromStorage<T>(
  key: string,
  fallback: T,
  options?: UsePersistedStateOptions<T>,
): T {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as Envelope<T> | T;

    let candidate: unknown;
    // Без версії запис має вигляд `{ data }` — без поля `v`. Раніше конверт
    // розпізнавався лише за наявності обох полів, тож валідатору діставався
    // сам конверт, не проходив перевірку — і кеш губився при кожному
    // перезавантаженні (застосунок стартував порожнім, якщо сервер мовчав).
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      'data' in (parsed as Record<string, unknown>)
    ) {
      const envelope = parsed as Envelope<T>;
      if (options?.version !== undefined && envelope.v !== options.version) {
        return fallback;
      }
      candidate = envelope.data;
    } else {
      candidate = parsed;
    }

    if (options?.validate) {
      return options.validate(candidate) ? candidate : fallback;
    }
    return candidate as T;
  } catch {
    return fallback;
  }
}

function writeToStorage<T>(key: string, value: T, version?: number): void {
  try {
    if (typeof window === 'undefined') return;
    const payload: Envelope<T> =
      version !== undefined ? { v: version, data: value } : { data: value };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function usePersistedState<T>(
  key: string,
  fallback: T,
  options?: UsePersistedStateOptions<T>,
): [T, (next: Updater<T>) => void] {
  const version = options?.version;

  const [state, setState] = useState<T>(() =>
    readFromStorage(key, fallback, options),
  );

  useEffect(() => {
    writeToStorage(key, state, version);
  }, [key, state, version]);

  const setPersisted = useCallback((next: Updater<T>) => {
    setState((prev) =>
      typeof next === 'function' ? (next as (p: T) => T)(prev) : next,
    );
  }, []);

  return [state, setPersisted];
}

export function clearPersistedState(key: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
