// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePaymentAccountOptions } from './usePaymentAccountOptions';

describe('usePaymentAccountOptions', () => {
  it('offers nothing while the wallet is empty', () => {
    const { result } = renderHook(() => usePaymentAccountOptions([], 'uk'));

    // Порожній гаманець колись підставляв сюди PUMB, Privat24, SOL і решту
    // базових ключів — рахунки, яких людина не заводила.
    expect(result.current.paymentChipOptions).toEqual([]);
  });

  it('keeps the account already written in the transaction being edited', () => {
    const { result } = renderHook(() => usePaymentAccountOptions([], 'uk', 'privat24'));

    expect(result.current.paymentChipOptions).toEqual([{ key: 'privat24', label: 'Privat24' }]);
  });

  it('offers the wallet accounts and nothing besides them', () => {
    const { result } = renderHook(() =>
      usePaymentAccountOptions([{ key: 'mono', name: 'Mono' }], 'uk'),
    );

    expect(result.current.paymentChipOptions).toEqual([{ key: 'mono', label: 'Mono' }]);
  });
});
