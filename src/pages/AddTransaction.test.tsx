// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AddTransaction from './AddTransaction';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  // Typed via generics rather than named parameters, so the payload can be
  // asserted without declaring arguments the mock body never uses.
  addTransaction: vi.fn<(draft: Record<string, unknown>) => Promise<boolean>>(async () => true),
  updateTransaction:
    vi.fn<(id: string, draft: Record<string, unknown>) => Promise<boolean>>(async () => true),
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => [] })),
  portfolioAccounts: [
    { accountKey: 'privat24', name: 'Privat24', primaryCurrency: 'UAH', section: 'bank' },
  ] as Array<Record<string, unknown>>,
  cryptoPrices: { USDT: 1, BTC: 60_000 } as Record<string, number>,
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
    accounts: mocks.portfolioAccounts,
    cryptoPrices: mocks.cryptoPrices,
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
    displayCurrency: 'UAH',
    fxRates: {
      base: 'USD',
      rates: { USD: 1, PLN: 4, UAH: 40 },
      updatedAt: '1970-01-01T00:00:00.000Z',
      source: 'fallback',
    },
  }),
}));

/** The two amount inputs of the transfer form, source first. */
const transferAmountInputs = (): HTMLInputElement[] =>
  Array.from(document.querySelectorAll('input[inputmode="decimal"]'));

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
    mocks.portfolioAccounts = [
      { accountKey: 'privat24', name: 'Privat24', primaryCurrency: 'UAH', section: 'bank' },
    ];
    mocks.cryptoPrices = { USDT: 1, BTC: 60_000 };
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

  it('groups and sorts every account in the transfer picker', () => {
    mocks.portfolioAccounts = [
      { accountKey: 'debt-z', name: 'Zed debt', primaryCurrency: 'UAH', section: 'debt' },
      { accountKey: 'btc-main', name: 'Bitcoin', primaryCurrency: 'USD', section: 'crypto' },
      { accountKey: 'wallet-main', name: 'Cash account', primaryCurrency: 'UAH', section: 'cash' },
      { accountKey: 'card-main', name: 'Card account', primaryCurrency: 'UAH', section: 'bank' },
    ];
    renderAdd('/add?type=transfer');

    fireEvent.click(screen.getByRole('button', { name: /addTx.transferFrom/ }));
    const dialogText = screen.getByRole('dialog').textContent ?? '';
    const expectedOrder = [
      'balance.sectionBank',
      'Card account',
      'balance.sectionCash',
      'Cash account',
      'balance.sectionCrypto',
      'Bitcoin',
      'balance.sectionDebt',
      'Zed debt',
    ];
    const positions = expectedOrder.map((value) => dialogText.indexOf(value));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  describe('cross-denomination transfers', () => {
    const cryptoAndCard = [
      { accountKey: 'binance', name: 'Binance', primaryCurrency: 'USDT', section: 'crypto' },
      { accountKey: 'karta', name: 'Karta', primaryCurrency: 'PLN', section: 'bank' },
    ];

    it('denominates each side by its own account, with no free-standing picker', () => {
      mocks.portfolioAccounts = cryptoAndCard;
      renderAdd('/add?type=transfer');

      // The old currency <select> let you claim a unit the account did not hold,
      // which the server could only reject.
      expect(document.querySelector('select')).toBe(null);
      expect(screen.getByText('USDT')).toBeTruthy();
      expect(screen.getByText('PLN')).toBeTruthy();
    });

    it('suggests the destination amount from the current rate', () => {
      mocks.portfolioAccounts = cryptoAndCard;
      renderAdd('/add?type=transfer');

      const [source, destination] = transferAmountInputs();
      fireEvent.change(source, { target: { value: '50' } });
      // 50 USDT -> 50 USD -> 200 PLN
      expect(destination.value).toBe('200');
    });

    it('keeps the amount the user actually received', () => {
      mocks.portfolioAccounts = cryptoAndCard;
      renderAdd('/add?type=transfer');

      const [source, destination] = transferAmountInputs();
      fireEvent.change(source, { target: { value: '50' } });
      fireEvent.change(destination, { target: { value: '190' } });
      expect(destination.value).toBe('190');

      // Re-typing the source must not overwrite a figure entered by hand.
      fireEvent.change(source, { target: { value: '60' } });
      expect(destination.value).toBe('190');
    });

    it('sends both account denominations on save', async () => {
      mocks.portfolioAccounts = cryptoAndCard;
      renderAdd('/add?type=transfer');

      const [source, destination] = transferAmountInputs();
      fireEvent.change(source, { target: { value: '50' } });
      fireEvent.change(destination, { target: { value: '190' } });
      fireEvent.click(screen.getByRole('button', { name: 'addTx.save' }));

      await vi.waitFor(() => expect(mocks.addTransaction).toHaveBeenCalled());
      expect(mocks.addTransaction.mock.calls[0][0]).toMatchObject({
        type: 'transfer',
        amount: 50,
        currency: 'USDT',
        transferToAmount: 190,
        transferToCurrency: 'PLN',
        fromAccountKey: 'binance',
        toAccountKey: 'karta',
      });
    });

    it('mirrors and locks the destination when both sides share a unit', () => {
      mocks.portfolioAccounts = [
        { accountKey: 'karta', name: 'Karta', primaryCurrency: 'PLN', section: 'bank' },
        { accountKey: 'karta2', name: 'Karta 2', primaryCurrency: 'PLN', section: 'bank' },
      ];
      renderAdd('/add?type=transfer');

      const [source, destination] = transferAmountInputs();
      fireEvent.change(source, { target: { value: '200' } });
      // What leaves is what arrives, so there is nothing to type.
      expect(destination.value).toBe('200');
      expect(destination.readOnly).toBe(true);
    });

    it('tells the user to enter the amount when the asset has no price', () => {
      mocks.portfolioAccounts = [
        { accountKey: 'ledger', name: 'Ledger', primaryCurrency: 'ETH', section: 'crypto' },
        { accountKey: 'karta', name: 'Karta', primaryCurrency: 'PLN', section: 'bank' },
      ];
      mocks.cryptoPrices = {};
      renderAdd('/add?type=transfer');

      fireEvent.change(transferAmountInputs()[0], { target: { value: '1' } });
      expect(screen.getByText('addTx.transferRateUnavailable')).toBeTruthy();
      expect(transferAmountInputs()[1].value).toBe('');
    });
  });
});
