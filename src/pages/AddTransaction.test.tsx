// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  displayCurrency: 'UAH' as string,
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
  getCustomCategories: vi.fn(async () => []),
  getCategoryPrefs: vi.fn(async () => []),
  saveCategoryPrefs: vi.fn(async () => []),
  createCustomCategory: vi.fn(),
  updateCustomCategory: vi.fn(),
  deleteCustomCategory: vi.fn(),
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
    displayCurrency: mocks.displayCurrency,
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
    mocks.displayCurrency = 'UAH';
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

  it('starts a new operation in the currency the app is set to', async () => {
    mocks.displayCurrency = 'PLN';
    renderAdd('/add');

    // Nothing dictates the unit yet, so the app's own currency does — not the
    // hryvnia the screen used to assume.
    expect((document.querySelector('select') as HTMLSelectElement).value).toBe('PLN');

    fireEvent.change(screen.getByPlaceholderText('addTx.amountPlaceholder'), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'addTx.save' }));

    await vi.waitFor(() => expect(mocks.addTransaction).toHaveBeenCalled());
    expect(mocks.addTransaction.mock.calls[0][0]).toMatchObject({ amount: 20, currency: 'PLN' });
  });

  it('lets an explicit prefill outrank the app currency', () => {
    mocks.displayCurrency = 'PLN';
    renderAdd('/add?currency=USD');
    expect((document.querySelector('select') as HTMLSelectElement).value).toBe('USD');
  });

  describe('the account decides the unit', () => {
    const cryptoAndCard = [
      { accountKey: 'binance', name: 'Binance', primaryCurrency: 'USDT', section: 'crypto' },
      { accountKey: 'karta', name: 'Karta', primaryCurrency: 'PLN', section: 'bank' },
    ];

    /** The read-only unit shown next to the amount once an account is picked. */
    const unitBadge = () => screen.getByRole('button', { name: 'addTx.currencyFromAccount' });

    it('denominates the amount by the account it is paid from', () => {
      mocks.portfolioAccounts = cryptoAndCard;
      renderAdd('/add?account=binance');

      // The old picker let you claim UAH for money that leaves a USDT wallet,
      // which the server could only reject.
      expect(document.querySelector('select')).toBe(null);
      expect(unitBadge().textContent).toBe('USDT');
    });

    it('leaves the token unit behind when the money moves to a card', () => {
      mocks.portfolioAccounts = cryptoAndCard;
      renderAdd('/add?account=binance');

      fireEvent.click(screen.getByText('addTx.paymentAccount'));
      fireEvent.click(screen.getByText('Karta'));
      // USDT cannot stay on a Polish card, so the card's own unit takes over —
      // and being fiat, it is open to the picker again.
      expect((document.querySelector('select') as HTMLSelectElement).value).toBe('PLN');
    });

    it('lets a fiat card take an amount typed in another currency', async () => {
      mocks.displayCurrency = 'PLN';
      mocks.portfolioAccounts = [
        { accountKey: 'privat24', name: 'Privat24', primaryCurrency: 'UAH', section: 'bank' },
      ];
      // What a remembered default account looks like on a real phone: it is
      // restored before anything is typed, and it used to drag the unit with it.
      localStorage.setItem(
        'add_tx_defaults_v1',
        JSON.stringify({ type: 'expense', categoryId: 'food', paymentAccount: 'privat24' }),
      );
      renderAdd('/add');

      await vi.waitFor(() => expect(screen.getByText('Privat24')).toBeTruthy());
      expect((document.querySelector('select') as HTMLSelectElement).value).toBe('PLN');

      fireEvent.change(screen.getByPlaceholderText('addTx.amountPlaceholder'), {
        target: { value: '20' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'addTx.save' }));

      // Sent as typed; the server debits the hryvnia card by the converted sum.
      await vi.waitFor(() => expect(mocks.addTransaction).toHaveBeenCalled());
      expect(mocks.addTransaction.mock.calls[0][0]).toMatchObject({ amount: 20, currency: 'PLN' });
    });

    it('sends the account unit on save', async () => {
      mocks.portfolioAccounts = cryptoAndCard;
      renderAdd('/add?account=binance');

      fireEvent.change(screen.getByPlaceholderText('addTx.amountPlaceholder'), {
        target: { value: '25' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'addTx.save' }));

      await vi.waitFor(() => expect(mocks.addTransaction).toHaveBeenCalled());
      expect(mocks.addTransaction.mock.calls[0][0]).toMatchObject({
        amount: 25,
        currency: 'USDT',
        type: 'expense',
      });
    });

    it('keeps the picker while no account stands behind the amount', () => {
      mocks.portfolioAccounts = cryptoAndCard;
      renderAdd('/add');

      const select = document.querySelector('select');
      expect(select).not.toBe(null);
      fireEvent.change(select as HTMLSelectElement, { target: { value: 'PLN' } });
      expect((select as HTMLSelectElement).value).toBe('PLN');
    });

    it('keeps the recorded unit when editing, even once the account is re-picked', () => {
      // tx-1 is 50 UAH on a Polish card: restating it as 50 zł because the card
      // is Polish would rewrite what happened, not correct it.
      mocks.portfolioAccounts = [
        { accountKey: 'privat24', name: 'Privat24', primaryCurrency: 'PLN', section: 'bank' },
      ];
      renderAdd('/add?edit=tx-1');

      const select = document.querySelector('select') as HTMLSelectElement;
      expect(select.value).toBe('UAH');

      fireEvent.click(screen.getByText('addTx.paymentAccount'));
      fireEvent.click(within(screen.getByRole('dialog')).getByText('Privat24'));
      expect((document.querySelector('select') as HTMLSelectElement).value).toBe('UAH');
    });

    it('still hands a crypto wallet its own unit when editing', () => {
      mocks.portfolioAccounts = [
        { accountKey: 'privat24', name: 'Binance', primaryCurrency: 'USDT', section: 'crypto' },
      ];
      renderAdd('/add?edit=tx-1');

      // The stored 50 UAH survives until the wallet is picked deliberately;
      // after that no picker remains, because a token position takes no zloty.
      expect((document.querySelector('select') as HTMLSelectElement).value).toBe('UAH');
      fireEvent.click(screen.getByText('addTx.paymentAccount'));
      fireEvent.click(within(screen.getByRole('dialog')).getByText('Binance'));
      expect(document.querySelector('select')).toBe(null);
      expect(unitBadge().textContent).toBe('USDT');
    });
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
