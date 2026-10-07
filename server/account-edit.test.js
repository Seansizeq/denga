import { describe, expect, it } from 'vitest';
import { planAccountBalanceEdit } from './account-edit.js';

describe('planAccountBalanceEdit', () => {
  it('баланс не змінювали — лишається той, що в базі, хоч би що там сталося', () => {
    // Поки форма була відкрита, банк списав 100: перейменування цього не скасовує.
    expect(planAccountBalanceEdit({ stored: 900, requested: undefined, expected: undefined, unitChanged: false })).toEqual({
      ok: true,
      nextAmount: 900,
      delta: 0,
      recordDelta: false,
    });
  });

  it('новий баланс від того самого числа — корекція на різницю', () => {
    expect(planAccountBalanceEdit({ stored: 1000, requested: 1200, expected: 1000, unitChanged: false })).toEqual({
      ok: true,
      nextAmount: 1200,
      delta: 200,
      recordDelta: true,
    });
  });

  it('рахунок рухався, поки його редагували, — відмова з поточним балансом', () => {
    expect(planAccountBalanceEdit({ stored: 900, requested: 1200, expected: 1000, unitChanged: false })).toEqual({
      ok: false,
      code: 'ACCOUNT_BALANCE_CHANGED',
      currentAmount: 900,
    });
  });

  it('без числа, від якого редагували, поводиться як раніше', () => {
    // Старий клієнт ще не знає про `expectedPrimaryAmount`.
    expect(planAccountBalanceEdit({ stored: 900, requested: 1200, expected: undefined, unitChanged: false }).ok).toBe(true);
  });

  it('зміна валюти не записує корекцію через різні одиниці', () => {
    const plan = planAccountBalanceEdit({ stored: 1000, requested: 25, expected: 1000, unitChanged: true });
    expect(plan).toMatchObject({ ok: true, nextAmount: 25, recordDelta: false });
  });

  it('копійки похибки не дають ні відмови, ні корекції', () => {
    const plan = planAccountBalanceEdit({ stored: 100.0000001, requested: 100, expected: 100, unitChanged: false });
    expect(plan).toMatchObject({ ok: true, recordDelta: false });
  });
});
