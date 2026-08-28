import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCustomCategory,
  deleteCustomCategory,
  getCategoryPrefs,
  getCustomCategories,
  saveCategoryPrefs,
  updateCustomCategory,
  type CategoryType,
  type CustomCategoryDto,
} from '../api/client';
import {
  CATEGORIES,
  inferCustomCategoryColor,
  inferCustomCategoryIcon,
} from '../constants/categories';
import { useTranslation } from '../i18n/LanguageContext';
import type { CategoryKey } from '../i18n/translations';

/** The pre-server store for built-in renames. Read once to import, then kept as a fallback. */
const LEGACY_OVERRIDES_KEY = 'category_overrides_v1';
const LEGACY_IMPORTED_KEY = 'category_overrides_imported_v1';

export interface CatalogCategory {
  id: string;
  /** Already resolved: an override wins over the built-in translation. */
  name: string;
  icon: string;
  color: string;
  isCustom: boolean;
}

export type CategoryOverrides = Record<string, { name?: string; icon?: string; color?: string }>;

export interface CategoryEdit {
  name: string;
  icon: string;
  color: string;
}

const builtInsFor = (type: CategoryType) =>
  CATEGORIES.filter((c) => c.type === type || c.type === 'both');

const readLegacyOverrides = (): CategoryOverrides => {
  try {
    const raw = localStorage.getItem(LEGACY_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as CategoryOverrides) : {};
  } catch {
    return {};
  }
};

const normalizeCustom = (dto: CustomCategoryDto) => ({
  id: dto.id,
  name: dto.name,
  icon: inferCustomCategoryIcon(dto.name, dto.icon),
  color: inferCustomCategoryColor(dto.name, dto.color),
});

/**
 * One ordered list of categories of a given type, built-in and custom together.
 *
 * Built-in categories live in code, so what the user changed about them — the
 * name, icon, color and where they sit — is kept apart in category_prefs and
 * merged here. Custom ones carry their own row, and their id encodes the name,
 * icon and color, so editing one hands back a new id.
 */
export const useCategoryCatalog = (type: CategoryType) => {
  const { t } = useTranslation();
  const [customs, setCustoms] = useState<Array<{ id: string; name: string; icon: string; color: string }>>([]);
  const [overrides, setOverrides] = useState<CategoryOverrides>({});
  const [order, setOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Latest state, so a save triggered right after an edit never writes a stale list. */
  const stateRef = useRef({ customs, overrides, order });
  useEffect(() => {
    stateRef.current = { customs, overrides, order };
  }, [customs, overrides, order]);

  const persist = useCallback(
    async (nextOrder: string[], nextOverrides: CategoryOverrides) => {
      const items = nextOrder.map((id) => {
        const override = nextOverrides[id];
        // Custom categories keep their own name/icon/color; prefs only place them.
        if (!override) return { id };
        return {
          id,
          name: override.name ?? null,
          icon: override.icon ?? null,
          color: override.color ?? null,
        };
      });
      setSaving(true);
      try {
        await saveCategoryPrefs(type, items);
      } finally {
        setSaving(false);
      }
    },
    [type],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [customRows, prefs] = await Promise.all([
        getCustomCategories(type).catch(() => [] as CustomCategoryDto[]),
        getCategoryPrefs(type).catch(() => []),
      ]);
      const loadedCustoms = customRows.map(normalizeCustom);
      const known = [...builtInsFor(type).map((c) => c.id), ...loadedCustoms.map((c) => c.id)];

      const nextOverrides: CategoryOverrides = {};
      for (const pref of prefs) {
        if (!pref.name && !pref.icon && !pref.color) continue;
        nextOverrides[pref.id] = {
          name: pref.name ?? undefined,
          icon: pref.icon ?? undefined,
          color: pref.color ?? undefined,
        };
      }

      // Anything the prefs do not mention (a new built-in, a category added on
      // another device) keeps its default place at the end.
      const ordered = prefs.map((p) => p.id).filter((id) => known.includes(id));
      for (const id of known) {
        if (!ordered.includes(id)) ordered.push(id);
      }

      setCustoms(loadedCustoms);
      setOverrides(nextOverrides);
      setOrder(ordered);

      // Renames made before this moved to the server would otherwise vanish.
      if (prefs.length === 0 && !localStorage.getItem(LEGACY_IMPORTED_KEY)) {
        const legacy = readLegacyOverrides();
        const relevant: CategoryOverrides = {};
        for (const id of known) {
          if (legacy[id]) relevant[id] = legacy[id];
        }
        localStorage.setItem(LEGACY_IMPORTED_KEY, '1');
        if (Object.keys(relevant).length > 0) {
          setOverrides(relevant);
          await persist(ordered, relevant).catch(() => {});
        }
      }
    } finally {
      setLoading(false);
    }
  }, [type, persist]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo<CatalogCategory[]>(() => {
    const builtIns = new Map<string, (typeof CATEGORIES)[number]>(
      builtInsFor(type).map((c) => [c.id as string, c]),
    );
    const customById = new Map(customs.map((c) => [c.id, c]));
    const list: CatalogCategory[] = [];
    for (const id of order) {
      const override = overrides[id] ?? {};
      const custom = customById.get(id);
      if (custom) {
        list.push({
          id,
          name: override.name?.trim() || custom.name,
          icon: override.icon ?? custom.icon,
          color: override.color ?? custom.color,
          isCustom: true,
        });
        continue;
      }
      const builtIn = builtIns.get(id);
      if (!builtIn) continue;
      list.push({
        id,
        name: override.name?.trim() || t('categories', id as CategoryKey),
        icon: override.icon ?? builtIn.icon,
        color: override.color ?? builtIn.color,
        isCustom: false,
      });
    }
    return list;
  }, [order, overrides, customs, type, t]);

  const reorder = useCallback(
    async (nextOrder: string[]) => {
      setOrder(nextOrder);
      await persist(nextOrder, stateRef.current.overrides);
    },
    [persist],
  );

  const createCategory = useCallback(
    async (edit: CategoryEdit) => {
      const created = await createCustomCategory({ type, ...edit });
      const row = normalizeCustom(created);
      const nextOrder = stateRef.current.order.includes(row.id)
        ? stateRef.current.order
        : [...stateRef.current.order, row.id];
      setCustoms((prev) => [...prev.filter((c) => c.id !== row.id), row]);
      setOrder(nextOrder);
      await persist(nextOrder, stateRef.current.overrides);
      return row.id;
    },
    [type, persist],
  );

  const saveCategory = useCallback(
    async (id: string, edit: CategoryEdit) => {
      const custom = stateRef.current.customs.find((c) => c.id === id);
      if (!custom) {
        // Built-in: the change lives only in prefs, the category itself is code.
        const nextOverrides: CategoryOverrides = { ...stateRef.current.overrides, [id]: { ...edit } };
        setOverrides(nextOverrides);
        await persist(stateRef.current.order, nextOverrides);
        return id;
      }
      const updated = await updateCustomCategory(id, edit);
      const row = normalizeCustom(updated);
      // The id encodes name/icon/color, so an edit renames it — keep its place.
      const nextOrder = stateRef.current.order.map((entry) => (entry === id ? row.id : entry));
      setCustoms((prev) => prev.map((c) => (c.id === id ? row : c)));
      setOrder(nextOrder);
      await persist(nextOrder, stateRef.current.overrides);
      return row.id;
    },
    [persist],
  );

  const removeCategory = useCallback(
    async (id: string) => {
      await deleteCustomCategory(id);
      const nextOrder = stateRef.current.order.filter((entry) => entry !== id);
      setCustoms((prev) => prev.filter((c) => c.id !== id));
      setOrder(nextOrder);
      await persist(nextOrder, stateRef.current.overrides);
    },
    [persist],
  );

  return {
    categories,
    customs,
    overrides,
    order,
    loading,
    saving,
    reload: load,
    reorder,
    createCategory,
    saveCategory,
    removeCategory,
  };
};
