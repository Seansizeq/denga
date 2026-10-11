import { apiFetch } from './client';
import type { Denomination } from '../utils/denomination';

/** Повернення зменшує борг, добір («позичив ще» / «взяв ще») — збільшує. */
export type DebtMovementKind = 'repayment' | 'increase';

export type DebtHistoryEntryKind = 'opening' | 'adjustment' | 'repayment' | 'increase' | 'income' | 'expense';

export interface DebtHistoryEntry {
  id: string;
  kind: DebtHistoryEntryKind;
  date: string;
  /** Зміна боргу в його валюті: плюс — виріс, мінус — зменшився. */
  delta: number;
  note: string | null;
  transactionId: string | null;
  categoryId: string | null;
  /** Рахунок по той бік переказу. */
  counterpartAccountKey: string | null;
  /** Запис веде картка боргу: правка — лише видаленням і новим записом. */
  managed: boolean;
}

export interface DebtHistory {
  accountKey: string;
  currency: Denomination;
  debtDirection: 'owed_to_me' | 'owed_by_me';
  balance: number;
  /** Усього позичено / взято: залишок + повернуто + списано. */
  total: number;
  repaid: number;
  writtenOff: number;
  /** Частка закритого, від 0 до 1. */
  progress: number;
  entries: DebtHistoryEntry[];
}

export interface DebtMovementInput {
  kind: DebtMovementKind;
  /** Скільки змінюється борг, у його валюті. */
  amount: number;
  paymentAccountKey: string;
  /** Скільки пройшло через рахунок, коли його валюта інша. Без нього — за курсом. */
  paymentAmount?: number;
  /** `YYYY-MM-DD`; без нього — зараз. */
  date?: string;
  note?: string;
}

/** Відмова сервера з її кодом — щоб показати людині причину, а не «не вдалося». */
export class DebtRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly available: number | null;

  constructor(status: number, code: string, available: number | null = null) {
    super(code || `debt request failed (${status})`);
    this.name = 'DebtRequestError';
    this.status = status;
    this.code = code;
    this.available = available;
  }
}

const readError = async (res: Response): Promise<DebtRequestError> => {
  const body = (await res.json().catch(() => null)) as { code?: unknown; available?: unknown } | null;
  const available = Number(body?.available);
  return new DebtRequestError(
    res.status,
    typeof body?.code === 'string' ? body.code : '',
    Number.isFinite(available) ? available : null,
  );
};

export const recordDebtMovement = async (
  debtAccountKey: string,
  input: DebtMovementInput,
): Promise<{ newAmount: number }> => {
  const res = await apiFetch(`/api/accounts/${encodeURIComponent(debtAccountKey)}/debt-movement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as { newAmount: number };
};

export const fetchDebtHistory = async (debtAccountKey: string): Promise<DebtHistory> => {
  const res = await apiFetch(`/api/accounts/${encodeURIComponent(debtAccountKey)}/debt-history`);
  if (!res.ok) throw await readError(res);
  return (await res.json()) as DebtHistory;
};
