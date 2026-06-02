// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  hasPrefillParams,
  loadAddTransactionDefaults,
  saveAddTransactionDefaults,
} from './addTransactionDefaults';

describe('addTransactionDefaults', () => {
  afterEach(() => {
    localStorage.removeItem('add_tx_defaults_v1');
  });

  it('round-trips defaults in localStorage', () => {
    saveAddTransactionDefaults({
      type: 'expense',
      currency: 'UAH',
      categoryId: 'food',
      paymentAccount: 'privat24',
    });
    expect(loadAddTransactionDefaults()).toEqual({
      type: 'expense',
      currency: 'UAH',
      categoryId: 'food',
      paymentAccount: 'privat24',
    });
  });

  it('detects prefill search params', () => {
    expect(hasPrefillParams(new URLSearchParams('amount=10'), false)).toBe(true);
    expect(hasPrefillParams(new URLSearchParams('account=wallet'), false)).toBe(true);
    expect(hasPrefillParams(new URLSearchParams(), false)).toBe(false);
    expect(hasPrefillParams(new URLSearchParams('amount=1'), true)).toBe(true);
  });
});
