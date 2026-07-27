import { useCallback, useEffect, useState } from 'react';

const readHiddenIds = (storageKey: string): Set<string> => {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
};

export const usePersistedHiddenIds = (storageKey: string) => {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => readHiddenIds(storageKey));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(hiddenIds)));
    } catch {
      // Visibility still works for this session if storage is unavailable.
    }
  }, [hiddenIds, storageKey]);

  const toggleHidden = useCallback((id: string) => {
    setHiddenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return { hiddenIds, toggleHidden };
};
