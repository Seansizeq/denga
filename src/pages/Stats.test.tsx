// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Stats from './Stats';

const today = new Date().toISOString();

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getBudgets: vi.fn(async () => []),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('../api/client', () => ({
  getBudgets: mocks.getBudgets,
}));

vi.mock('../context/TransactionContext', () => ({
  useTransactions: () => ({
    transactions: [
      { id: '1', amount: 100, currency: 'UAH', categoryId: 'food', type: 'expense', date: today },
      { id: '2', amount: 50, currency: 'UAH', categoryId: 'transport', type: 'expense', date: today },
      { id: '3', amount: 300, currency: 'UAH', categoryId: 'salary', type: 'income', date: today },
    ],
  }),
}));

vi.mock('../i18n/LanguageContext', () => ({
  useTranslation: () => ({
    t: (section: string, key: string) => `${section}.${key}`,
    locale: 'uk-UA',
    displayCurrency: 'UAH',
    convertAmount: (amount: number) => amount,
  }),
}));

function renderStats(initialPath = '/stats') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/stats" element={<Stats />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Stats page', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders the four range tabs and the category section', () => {
    renderStats();
    expect(screen.getByText('stats.title')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'range.today' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'range.week' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'range.month' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'range.year' })).toBeTruthy();
    expect(screen.getByText('stats.byCategory')).toBeTruthy();
    expect(screen.getByText('stats.trendTitle')).toBeTruthy();
    expect(screen.getByText('stats.insightsTitle')).toBeTruthy();
  });

  it('switches range and chart type without crashing', () => {
    renderStats();
    fireEvent.click(screen.getByRole('tab', { name: 'range.year' }));
    fireEvent.click(screen.getByRole('tab', { name: 'range.today' }));
    fireEvent.click(screen.getByRole('tab', { name: 'balance.income' }));
    expect(screen.getByText('stats.byCategory')).toBeTruthy();
  });

  it('navigates to filtered history when a category row is clicked', () => {
    renderStats();
    fireEvent.click(screen.getByText('categories.transport'));
    expect(mocks.navigate).toHaveBeenCalledWith(expect.stringContaining('/history?'));
    expect(mocks.navigate).toHaveBeenCalledWith(expect.stringContaining('categoryId=transport'));
  });

  it('hides and restores a category in the chart', () => {
    renderStats();

    fireEvent.click(screen.getByRole('button', { name: 'stats.hideCategory: categories.food' }));

    expect(screen.getByRole('button', { name: 'stats.showCategory: categories.food' })).toBeTruthy();
    expect(localStorage.getItem('denga.stats.hiddenCategories.v1')).toBe('["food"]');

    fireEvent.click(screen.getByRole('button', { name: 'stats.showCategory: categories.food' }));
    expect(screen.getByRole('button', { name: 'stats.hideCategory: categories.food' })).toBeTruthy();
  });
});
