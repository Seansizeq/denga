import { useState, useEffect, useCallback } from 'react';
import type { TransactionType } from '../types';
import type { CurrencyCode } from '../utils/currency';

const STORAGE_KEY = 'expense_templates_v1';

export interface ExpenseTemplate {
  id: string;
  name: string;
  type: TransactionType;
  amount?: number;
  currency: CurrencyCode;
  categoryId: string;
  note?: string;
  account?: string;
}

export function useExpenseTemplates() {
  const [templates, setTemplates] = useState<ExpenseTemplate[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  }, [templates]);

  const saveTemplate = useCallback((template: Omit<ExpenseTemplate, 'id'>) => {
    const id = `tpl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setTemplates((prev) => [{ ...template, id }, ...prev]);
    return id;
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { templates, saveTemplate, deleteTemplate };
}
