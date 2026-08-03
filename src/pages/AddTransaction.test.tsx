// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AddTransaction from './AddTransaction';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  addTransaction: vi.fn(async () => true),
  updateTransaction: vi.fn(async () => true),
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => [] })),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('../api/client', () => ({
  apiFetch: mocks.apiFetch,
}));

vi.mock('../context/TransactionContext', () => ({
  useTransactions: () => ({
    transactions: [
      {
        id: 'tx-1',
        amount: 50,
        currency: 'UAH',
        categoryId: 'food',
        type: 'expense',
        date: '2026-06-01',
        note: 'Account: privat24',
      },
    ],
    addTransaction: mocks.addTransaction,
    updateTransaction: mocks.updateTransaction,
    isBootstrapping: false,
  }),
}));

vi.mock('../context/PortfolioContext', () => ({
  usePortfolio: () => ({
    accounts: [{ accountKey: 'privat24', name: 'Privat24', primaryCurrency: 'UAH' }],
  }),
}));

vi.mock('../hooks/useExpenseTemplates', () => ({
  useExpenseTemplates: () => ({
    templates: [],
    saveTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
  }),
}));

vi.mock('../i18n/LanguageContext', () => ({
  useTranslation: () => ({
    language: 'uk',
    t: (section: string, key: string) => `${section}.${key}`,
  }),
}));

function renderAdd(initialPath = '/add') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/add" element={<AddTransaction />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AddTransaction', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    mocks.apiFetch.mockResolvedValue({ ok: true, json: async () => [] });
  });

  it('prefills payment account from note query param', () => {
    renderAdd('/add?note=Shop%20Account%3A%20privat24');
    expect(screen.getByText('Privat24')).toBeTruthy();
  });

  it('prefills payment account from account query param', () => {
    renderAdd('/add?account=wallet');
    expect(screen.getByText('Готівка')).toBeTruthy();
  });

  it('shows not-found banner for missing edit id', () => {
    renderAdd('/add?edit=missing-id');
    expect(screen.getByRole('alert').textContent).toContain('addTx.editNotFound');
    expect(screen.getByRole('button', { name: 'addTx.saveChanges' }).hasAttribute('disabled')).toBe(true);
  });

  it('uses transfer from/to labels in transfer form', () => {
    renderAdd('/add?type=transfer');
    expect(screen.getAllByText('addTx.transferFrom')).toHaveLength(2);
    expect(screen.getAllByText('addTx.transferTo')).toHaveLength(2);
  });

  it('opens account picker sheet on row tap', () => {
    renderAdd('/add');
    fireEvent.click(screen.getByText('addTx.paymentAccount'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
