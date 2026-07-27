// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AssetRing from './AssetRing';

vi.mock('../../i18n/LanguageContext', () => ({
  useTranslation: () => ({
    t: (section: string, key: string) => `${section}.${key}`,
    locale: 'en-US',
    displayCurrency: 'USD',
  }),
}));

describe('AssetRing category visibility', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('hides and restores a wallet segment and persists the choice', () => {
    render(
      <AssetRing
        segments={[
          { id: 'bank', label: 'Cards', amount: 100, color: '#ff0000' },
          { id: 'cash', label: 'Cash', amount: 50, color: '#0000ff' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'stats.hideCategory: Cards' }));

    expect(screen.getByRole('button', { name: 'stats.showCategory: Cards' })).toBeTruthy();
    expect(localStorage.getItem('denga.accounts.hiddenSections.v1')).toBe('["bank"]');

    fireEvent.click(screen.getByRole('button', { name: 'stats.showCategory: Cards' }));
    expect(screen.getByRole('button', { name: 'stats.hideCategory: Cards' })).toBeTruthy();
  });
});
