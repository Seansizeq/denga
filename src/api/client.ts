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

export type PlannerSettings = {
  /** null = ask each time; "none" = start without template; otherwise template id */
  defaultShiftTemplateId: string | null;
};

export type PlannerAutomation = {
  token: string;
  startUrl: string;
  endUrl: string;
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

export const getPlannerSettings = async (): Promise<PlannerSettings> => {
  const res = await apiFetch('/api/planner/settings');
  if (!res.ok) throw new Error('failed to load planner settings');
  return res.json();
};

export const getPlannerAutomation = async (): Promise<PlannerAutomation> => {
  const res = await apiFetch('/api/planner/automation');
  if (!res.ok) throw new Error('failed to load planner automation');
  return res.json();
};

export const rotatePlannerAutomationToken = async (): Promise<PlannerAutomation> => {
  const res = await apiFetch('/api/planner/automation/rotate-token', { method: 'POST' });
  if (!res.ok) throw new Error('failed to rotate automation token');
  return res.json();
};

export const updatePlannerSettings = async (
  patch: Partial<PlannerSettings>
): Promise<PlannerSettings> => {
  const res = await apiFetch('/api/planner/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) detail = `: ${body.error}`;
    } catch {
      /* ignore */
    }
    throw new Error(`failed to update planner settings${detail}`);
  }
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

export type ExpenseTemplatePayload = {
  id?: string;
  name: string;
  type: 'income' | 'expense';
  amount?: number;
  currency: string;
  categoryId: string;
  note?: string;
  account?: string;
};

export type ExpenseTemplateDto = {
  id: string;
  name: string;
  type: 'income' | 'expense';
  amount?: number;
  currency: string;
  categoryId: string;
  note?: string;
  account?: string;
};

export const getExpenseTemplates = async (): Promise<ExpenseTemplateDto[]> => {
  const res = await apiFetch('/api/expense-templates');
  if (!res.ok) throw new Error('failed to load templates');
  return res.json();
};

export const createExpenseTemplate = async (
  body: ExpenseTemplatePayload
): Promise<ExpenseTemplateDto> => {
  const res = await apiFetch('/api/expense-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error('failed to create template') as Error & { code?: string };
    try {
      const j = (await res.json()) as { code?: string };
      if (typeof j?.code === 'string') err.code = j.code;
    } catch {
      /* ignore */
    }
    throw err;
  }
  return res.json();
};

export const deleteExpenseTemplate = async (id: string): Promise<void> => {
  const res = await apiFetch(`/api/expense-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
  // A template already gone on the server is the state the caller wanted.
  if (!res.ok && res.status !== 404) throw new Error('failed to delete template');
};

export type GoalCurrency = 'UAH' | 'PLN' | 'USD';

export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  saved: number;
  contributionsCount: number;
  currency: GoalCurrency;
  deadline: string | null;
  icon: string;
  color: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GoalContribution = {
  id: string;
  goalId: string;
  amount: number;
  date: string;
  note: string;
  createdAt: string;
  /** Якщо внесок списався з рахунку — id транзакції-витрати */
  transactionId?: string | null;
};

export const getGoals = async (): Promise<Goal[]> => {
  const res = await apiFetch('/api/goals');
  if (!res.ok) throw new Error('failed to load goals');
  return res.json();
};

export const getGoal = async (id: string): Promise<Goal> => {
  const res = await apiFetch(`/api/goals/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('failed to load goal');
  return res.json();
};

export const createGoal = async (body: {
  name: string;
  targetAmount: number;
  currency: GoalCurrency;
  deadline?: string | null;
  icon?: string;
  color?: string;
}): Promise<Goal> => {
  const res = await apiFetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('failed to create goal');
  return res.json();
};

export const updateGoal = async (
  id: string,
  patch: Partial<{
    name: string;
    targetAmount: number;
    currency: GoalCurrency;
    deadline: string | null;
    icon: string;
    color: string;
    archived: boolean;
  }>
): Promise<Goal> => {
  const res = await apiFetch(`/api/goals/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('failed to update goal');
  return res.json();
};

export const deleteGoal = async (id: string): Promise<void> => {
  const res = await apiFetch(`/api/goals/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('failed to delete goal');
};

export const getContributions = async (goalId: string): Promise<GoalContribution[]> => {
  const res = await apiFetch(`/api/goals/${encodeURIComponent(goalId)}/contributions`);
  if (!res.ok) throw new Error('failed to load contributions');
  return res.json();
};

export const addContribution = async (
  goalId: string,
  body: { amount: number; date: string; note?: string; accountKey?: string | null }
): Promise<GoalContribution> => {
  const res = await apiFetch(`/api/goals/${encodeURIComponent(goalId)}/contributions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error('failed to add contribution') as Error & { code?: string };
    try {
      const j = (await res.json()) as { code?: string };
      if (typeof j?.code === 'string') err.code = j.code;
    } catch {
      /* ignore */
    }
    throw err;
  }
  return res.json();
};

export const deleteContribution = async (goalId: string, contribId: string): Promise<void> => {
  const res = await apiFetch(
    `/api/goals/${encodeURIComponent(goalId)}/contributions/${encodeURIComponent(contribId)}`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error('failed to delete contribution');
};
