import { describe, expect, it } from 'vitest';
import { getAccountPickerGroup, sortAccountPickerItems } from './accountPicker';

describe('accountPicker', () => {
  it('keeps every account and groups ordinary, crypto, then debt accounts', () => {
    const items = [
      { key: 'loan-z', label: 'Zed debt', section: 'debt' as const },
      { key: 'btc', label: 'Bitcoin', section: 'crypto' as const },
      { key: 'wallet', label: 'Cash', section: 'cash' as const },
      { key: 'card-b', label: 'Beta card', section: 'bank' as const },
      { key: 'stock', label: 'Apple', section: 'stocks' as const },
      { key: 'loan-a', label: 'Alpha debt', section: 'debt' as const },
      { key: 'card-a', label: 'Alpha card', section: 'bank' as const },
    ];

    const sorted = sortAccountPickerItems(items, 'en');

    expect(sorted.map((item) => item.key)).toEqual([
      'card-a',
      'card-b',
      'wallet',
      'stock',
      'btc',
      'loan-a',
      'loan-z',
    ]);
    expect(sorted.map((item) => getAccountPickerGroup(item.section))).toEqual([
      'ordinary',
      'ordinary',
      'ordinary',
      'crypto',
      'crypto',
      'debt',
      'debt',
    ]);
    expect(new Set(sorted.map((item) => item.key)).size).toBe(items.length);
  });

  it('uses the account key as a deterministic tie-breaker', () => {
    const sorted = sortAccountPickerItems([
      { key: 'card-b', label: 'Card', section: 'bank' as const },
      { key: 'card-a', label: 'Card', section: 'bank' as const },
    ]);

    expect(sorted.map((item) => item.key)).toEqual(['card-a', 'card-b']);
  });
});
