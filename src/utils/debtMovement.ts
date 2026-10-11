import { normalizeDenomination, roundForDenomination, type Denomination } from './denomination';

/**
 * Суми руху боргу з суми, набраної у формі. Те саме правило, що й
 * `resolveDebtMovementAmounts` на сервері (його використовує бот):
 *
 * - набрано у валюті боргу — це сума боргу; рахунок з іншою валютою сервер
 *   дорахує за курсом;
 * - набрано у валюті рахунку — це те, що пройшло через рахунок, а борг
 *   зменшиться на перераховану суму;
 * - третя валюта — борг за курсом, рахунок теж.
 *
 * `null`, коли курсу для перерахунку немає.
 */
export const resolveDebtMovementAmounts = ({
  amount,
  currency,
  debtCurrency,
  paymentCurrency,
  convert,
}: {
  amount: number;
  currency: Denomination;
  debtCurrency: Denomination;
  paymentCurrency: Denomination;
  convert: (amount: number, from: Denomination, to: Denomination) => number | null;
}): { amount: number; paymentAmount?: number } | null => {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = normalizeDenomination(currency);
  const debtUnit = normalizeDenomination(debtCurrency);
  if (unit === debtUnit) return { amount };
  const inDebtUnit = convert(amount, unit, debtUnit);
  if (inDebtUnit === null || !Number.isFinite(inDebtUnit) || inDebtUnit <= 0) return null;
  const rounded = roundForDenomination(inDebtUnit, debtUnit);
  return unit === normalizeDenomination(paymentCurrency) ? { amount: rounded, paymentAmount: amount } : { amount: rounded };
};

/**
 * Чи гроші при цьому русі йдуть **з** рахунку: позичив ще (мені винні) або
 * повернув свій борг (я винен). Інакше вони приходять на рахунок.
 */
export const debtMovementDrainsAccount = (
  kind: 'repayment' | 'increase',
  direction: 'owed_to_me' | 'owed_by_me' | null | undefined,
): boolean => (kind === 'increase') === (direction !== 'owed_by_me');
