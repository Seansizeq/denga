import { useCallback, useEffect, useRef, useState } from 'react';
import type { TransactionType } from '../types';
import type { CurrencyCode } from '../utils/currency';
import {
  createExpenseTemplate,
  deleteExpenseTemplate,
  getExpenseTemplates,
  type ExpenseTemplateDto,
} from '../api/client';
import { usePersistedState } from './usePersistedState';

/** Cache of the server list, so chips render before the request lands. */
const CACHE_KEY = 'expense_templates_cache_v1';
/** The pre-server store. Read once to import, then cleared. */
const LEGACY_KEY = 'expense_templates_v1';
const LEGACY_IMPORTED_KEY = 'expense_templates_imported_v1';

/**
 * A transfer cannot be a template: it is defined by a pair of accounts and two
 * amounts, none of which a one-tap chip can stand in for. The server rejects
 * `transfer` too, so the type says so here rather than failing at runtime.
 */
export type TemplateType = Exclude<TransactionType, 'transfer'>;

export interface ExpenseTemplate {
  id: string;
  name: string;
  type: TemplateType;
  amount?: number;
  currency: CurrencyCode;
  categoryId: string;
  note?: string;
  account?: string;
}

const isTemplateArray = (v: unknown): v is ExpenseTemplate[] =>
  Array.isArray(v) &&
  v.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      typeof (item as ExpenseTemplate).id === 'string' &&
      typeof (item as ExpenseTemplate).name === 'string' &&
      typeof (item as ExpenseTemplate).categoryId === 'string',
  );

const fromDto = (dto: ExpenseTemplateDto): ExpenseTemplate => ({
  id: dto.id,
  name: dto.name,
  type: dto.type,
  amount: dto.amount,
  currency: dto.currency as CurrencyCode,
  categoryId: dto.categoryId,
  note: dto.note,
  account: dto.account,
});

const readLegacyTemplates = (): ExpenseTemplate[] => {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return isTemplateArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Templates live on the server so they follow the user between devices; the
 * local copy is only a cache. Anything saved before the move is uploaded once,
 * keeping its original id so a repeated import cannot duplicate it.
 */
export function useExpenseTemplates() {
  const [templates, setTemplates] = usePersistedState<ExpenseTemplate[]>(
    CACHE_KEY,
    [],
    { validate: isTemplateArray },
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const syncedRef = useRef(false);

  const sync = useCallback(async () => {
    try {
      const remote = await getExpenseTemplates();
      const mapped = remote.map(fromDto);

      // One-time lift of whatever the old localStorage store still holds.
      const alreadyImported = localStorage.getItem(LEGACY_IMPORTED_KEY) === '1';
      if (!alreadyImported) {
        const legacy = readLegacyTemplates();
        const remoteIds = new Set(mapped.map((t) => t.id));
        const pending = legacy.filter((t) => !remoteIds.has(t.id));
        for (const tpl of pending) {
          try {
            const saved = await createExpenseTemplate({ ...tpl, currency: tpl.currency });
            mapped.unshift(fromDto(saved));
          } catch {
            // A single bad row must not block the rest of the import.
          }
        }
        localStorage.setItem(LEGACY_IMPORTED_KEY, '1');
        localStorage.removeItem(LEGACY_KEY);
      }

      setTemplates(mapped);
      setError('');
    } catch {
      // Offline or the request failed: the cached list stays on screen.
      setError('load');
    } finally {
      setIsLoading(false);
    }
  }, [setTemplates]);

  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    void sync();
  }, [sync]);

  const saveTemplate = useCallback(
    async (template: Omit<ExpenseTemplate, 'id'>): Promise<boolean> => {
      try {
        const saved = await createExpenseTemplate(template);
        setTemplates((prev) => [fromDto(saved), ...prev.filter((t) => t.id !== saved.id)]);
        setError('');
        return true;
      } catch (e) {
        setError((e as { code?: string })?.code === 'TEMPLATE_LIMIT_REACHED' ? 'limit' : 'save');
        return false;
      }
    },
    [setTemplates],
  );

  const deleteTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      // Removed on screen straight away, restored if the server refuses.
      const snapshot = templates;
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      try {
        await deleteExpenseTemplate(id);
        setError('');
        return true;
      } catch {
        setTemplates(snapshot);
        setError('delete');
        return false;
      }
    },
    [templates, setTemplates],
  );

  return { templates, saveTemplate, deleteTemplate, isLoading, error, refresh: sync };
}
