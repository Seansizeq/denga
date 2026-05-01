import type { TelegramWindow } from '../types/telegram';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const DEV_AUTH_BYPASS = import.meta.env.DEV;

const getTelegramInitData = (): string => {
  const tgWindow = window as Window & TelegramWindow;
  return tgWindow.Telegram?.WebApp?.initData ?? '';
};

const buildHeaders = (headers?: HeadersInit): Headers => {
  const out = new Headers(headers ?? {});
  const initData = getTelegramInitData();
  if (initData) out.set('x-telegram-init-data', initData);
  if (!initData && DEV_AUTH_BYPASS) out.set('x-telegram-init-data', 'dev-bypass');
  return out;
};

export const apiUrl = (path: string): string => `${API_URL}${path}`;

export const apiFetch = (path: string, init?: RequestInit): Promise<Response> =>
  fetch(apiUrl(path), {
    ...init,
    headers: buildHeaders(init?.headers),
  });

export type ReportSettings = {
  autoWeekly: boolean;
  autoMonthly: boolean;
  reportCurrency: 'UAH' | 'PLN' | 'USD';
  sendTime: string;
};

export type ReminderKind =
  | 'daily'
  | 'subscriptions'
  | 'inactivity'
  | 'shift_evening_before'
  | 'shift_unclosed'
  | 'fx_change';

export type Reminder = {
  id: string;
  kind: ReminderKind;
  title: string;
  enabled: boolean;
  timeHHMM: string;
  leadDays: number;
};

export type CategoryBudget = {
  categoryId: string;
  monthlyLimit: number;
  currency: 'UAH' | 'PLN' | 'USD';
};

export const getReportSettings = async (): Promise<ReportSettings> => {
  const res = await apiFetch('/api/reports/settings');
  if (!res.ok) throw new Error('failed to load report settings');
  return res.json();
};

export const updateReportSettings = async (patch: Partial<ReportSettings>): Promise<ReportSettings> => {
  const res = await apiFetch('/api/reports/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('failed to update report settings');
  return res.json();
};

export const sendWeeklyReportNow = async (): Promise<void> => {
  const res = await apiFetch('/api/reports/weekly/send-now', { method: 'POST' });
  if (!res.ok) throw new Error('failed to send weekly report');
};

export const sendMonthlyReportNow = async (): Promise<void> => {
  const res = await apiFetch('/api/reports/monthly/send-now', { method: 'POST' });
  if (!res.ok) throw new Error('failed to send monthly report');
};

export const getReminders = async (): Promise<Reminder[]> => {
  const res = await apiFetch('/api/reminders');
  if (!res.ok) throw new Error('failed to load reminders');
  return res.json();
};

export const updateReminder = async (id: string, patch: Partial<Reminder>): Promise<Reminder> => {
  const res = await apiFetch(`/api/reminders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('failed to update reminder');
  return res.json();
};

export const getBudgets = async (): Promise<CategoryBudget[]> => {
  const res = await apiFetch('/api/budgets');
  if (!res.ok) throw new Error('failed to load budgets');
  return res.json();
};

export const setBudget = async (
  categoryId: string,
  monthlyLimit: number,
  currency: CategoryBudget['currency']
): Promise<CategoryBudget> => {
  const res = await apiFetch(`/api/budgets/${encodeURIComponent(categoryId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monthlyLimit, currency }),
  });
  if (!res.ok) throw new Error('failed to save budget');
  return res.json();
};

export const deleteBudget = async (categoryId: string): Promise<void> => {
  const res = await apiFetch(`/api/budgets/${encodeURIComponent(categoryId)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('failed to delete budget');
};
