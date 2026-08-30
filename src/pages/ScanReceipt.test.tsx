// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScanReceipt from './ScanReceipt';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  scanReceipt: vi.fn(),
  compressImage: vi.fn(),
  addTransaction: vi.fn(),
  apiFetch: vi.fn(),
  portfolioAccounts: [] as Array<Record<string, unknown>>,
  cryptoPrices: { USDT: 1 } as Record<string, number>,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('../api/receipts', () => ({
  scanReceipt: mocks.scanReceipt,
}));

vi.mock('../utils/imageCompress', () => ({
  compressImage: mocks.compressImage,
}));

vi.mock('../api/client', () => ({
  apiFetch: mocks.apiFetch,
}));

vi.mock('../context/TransactionContext', () => ({
  useTransactions: () => ({
    addTransaction: mocks.addTransaction,
  }),
}));

vi.mock('../context/PortfolioContext', () => ({
  usePortfolio: () => ({
    accounts: mocks.portfolioAccounts,
    cryptoPrices: mocks.cryptoPrices,
    cryptoUsdHistory: null,
    refreshAccounts: vi.fn(),
    refreshCryptoPrices: vi.fn(),
    refreshCryptoHistory: vi.fn(),
  }),
}));

vi.mock('../i18n/LanguageContext', () => ({
  useTranslation: () => ({
    locale: 'uk-UA',
    language: 'uk',
    displayCurrency: 'UAH',
    fxRates: {
      base: 'USD',
      rates: { USD: 1, PLN: 4, UAH: 40 },
      updatedAt: '1970-01-01T00:00:00.000Z',
      source: 'fallback',
    },
    t: (section: string, key: string) => {
      const map: Record<string, string> = {
        'scan.title': 'Сканер чека',
        'scan.idleHint': 'idle',
        'scan.takePhoto': 'Сфотографувати чек',
        'scan.processing': 'Розпізнаємо чек…',
        'scan.retake': 'Зробити ще одне фото',
        'scan.totalLabel': 'Сума чека',
        'scan.noTotalFound': 'Сума не знайдена',
        'scan.unknownShop': 'Магазин не визначено',
        'scan.itemsTitle': 'Позиції чека',
        'scan.itemsMore': '+ ще {n} позицій',
        'scan.reviewTitle': 'Потрібна ручна перевірка',
        'scan.reviewHint': 'Ми щось розпізнали, але цей чек краще перевірити перед збереженням.',
        'scan.reviewReasonMissingShop': 'Магазин не вдалося визначити безпечно.',
        'scan.reviewReasonManualCheck': 'У результаті є неочевидні ознаки, які краще перевірити вручну.',
        'scan.ocrTextTitle': 'Розпізнаний текст',
        'scan.reviewAndEdit': 'Перевірити вручну',
        'scan.saveConfirmed': 'Зберегти без змін',
        'scan.selectPaymentAccount': 'Оберіть рахунок для списання',
        'addTx.category': 'Категорія',
        'addTx.paymentAccount': 'Рахунок',
        'addTx.paymentAccountHint': 'hint',
        'addTx.note': 'Нотатка',
        'addTx.notePlaceholder': 'Додайте примітку',
        'addTx.save': 'Зберегти',
        'addTx.saveFailed': 'Не вдалося зберегти. Перевір з’єднання і спробуй ще раз.',
        'history.edit': 'Редагувати',
      };
      return map[`${section}.${key}`] ?? `${section}.${key}`;
    },
  }),
}));

describe('ScanReceipt', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.scanReceipt.mockReset();
    mocks.compressImage.mockReset();
    mocks.addTransaction.mockReset();
    mocks.apiFetch.mockReset();
    mocks.portfolioAccounts = [];
    mocks.cryptoPrices = { USDT: 1 };
    mocks.apiFetch.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    mocks.compressImage.mockResolvedValue({
      base64: 'a'.repeat(200),
      dataUrl: 'data:image/jpeg;base64,aaaa',
      width: 800,
      height: 600,
      bytes: 300000,
    });
  });

  it('shows manual review state for uncertain scans', async () => {
    mocks.scanReceipt.mockResolvedValue({
      ok: true,
      receipt: {
        shop: null,
        total: 44.99,
        currency: 'PLN',
        date: '2026-05-12',
        categoryId: 'food',
        items: [{ name: 'CHIPSY', amount: 44.99 }],
        rawText: 'raw text',
        code: 'REVIEW_REQUIRED',
        reviewFlags: ['missing_shop'],
        reviewRequired: true,
        scanStatus: 'review_required',
      },
    });

    const { container } = render(<ScanReceipt />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })] } });

    expect(await screen.findByText('Потрібна ручна перевірка')).toBeTruthy();
    expect(screen.getByText('Магазин не вдалося визначити безпечно.')).toBeTruthy();
    expect(screen.getByText('Розпізнаний текст')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Перевірити вручну' })).toBeTruthy();
  });

  it('keeps the result view visible when save fails', async () => {
    mocks.addTransaction.mockResolvedValue(false);
    mocks.scanReceipt.mockResolvedValue({
      ok: true,
      receipt: {
        shop: 'АТБ',
        total: 61.4,
        currency: 'UAH',
        date: '2026-05-12',
        categoryId: 'food',
        items: [{ name: 'Хліб', amount: 22.5 }],
        rawText: 'raw text',
        code: 'OK',
        reviewFlags: [],
        reviewRequired: false,
        scanStatus: 'ok',
      },
    });

    const user = userEvent.setup();
    const { container } = render(<ScanReceipt />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })] } });

    expect(await screen.findByRole('button', { name: 'Зберегти без змін' })).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'PUMB' })[0]);
    await user.click(screen.getByRole('button', { name: 'Зберегти без змін' }));

    expect(await screen.findByText('Не вдалося зберегти. Перевір з’єднання і спробуй ще раз.')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByDisplayValue('АТБ')).toBeTruthy();
    });
  });
  describe('the account decides the unit', () => {
    const plnReceipt = {
      ok: true,
      receipt: {
        shop: 'Biedronka',
        total: 100,
        currency: 'PLN',
        date: '2026-05-12',
        categoryId: 'food',
        items: [],
        rawText: '',
        code: 'OK',
        reviewFlags: [],
        reviewRequired: false,
        scanStatus: 'ok',
      },
    };

    /** The editable receipt total. */
    const totalInput = (container: HTMLElement) =>
      container.querySelector('input[inputmode="decimal"]') as HTMLInputElement;

    const scan = async () => {
      const user = userEvent.setup();
      const view = render(<ScanReceipt />);
      const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['x'], 'r.jpg', { type: 'image/jpeg' })] } });
      await screen.findByRole('button', { name: 'Зберегти без змін' });
      return { user, container: view.container };
    };

    it('re-states the total in the unit of the account that paid', async () => {
      mocks.portfolioAccounts = [
        { accountKey: 'karta', name: 'Karta', primaryCurrency: 'PLN', section: 'bank' },
        { accountKey: 'privat', name: 'Privat', primaryCurrency: 'UAH', section: 'bank' },
      ];
      mocks.scanReceipt.mockResolvedValue(plnReceipt);
      mocks.addTransaction.mockResolvedValue(true);

      const { user, container } = await scan();
      expect(totalInput(container).value).toBe('100');

      // 100 PLN -> 25 USD -> 1000 UAH: the card is charged hryvnias, and
      // relabelling the figure would have claimed 100 ₴ was spent.
      await user.click(screen.getByRole('button', { name: 'Privat' }));
      expect(totalInput(container).value).toBe('1000');
      expect(screen.getByText('scan.amountFromAccount')).toBeTruthy();

      await user.click(screen.getByRole('button', { name: 'Зберегти без змін' }));
      await waitFor(() => expect(mocks.addTransaction).toHaveBeenCalled());
      expect(mocks.addTransaction.mock.calls[0][0]).toMatchObject({
        amount: 1000,
        currency: 'UAH',
        type: 'expense',
      });
    });

    it('leaves the receipt figure alone when the account holds its currency', async () => {
      mocks.portfolioAccounts = [
        { accountKey: 'karta', name: 'Karta', primaryCurrency: 'PLN', section: 'bank' },
      ];
      mocks.scanReceipt.mockResolvedValue(plnReceipt);
      mocks.addTransaction.mockResolvedValue(true);

      const { user, container } = await scan();
      await user.click(screen.getByRole('button', { name: 'Karta' }));

      expect(totalInput(container).value).toBe('100');
      expect(screen.queryByText('scan.amountFromAccount')).toBe(null);

      await user.click(screen.getByRole('button', { name: 'Зберегти без змін' }));
      await waitFor(() => expect(mocks.addTransaction).toHaveBeenCalled());
      expect(mocks.addTransaction.mock.calls[0][0]).toMatchObject({ amount: 100, currency: 'PLN' });
    });

    it('keeps the correction the user typed', async () => {
      mocks.portfolioAccounts = [
        { accountKey: 'privat', name: 'Privat', primaryCurrency: 'UAH', section: 'bank' },
      ];
      mocks.scanReceipt.mockResolvedValue(plnReceipt);
      mocks.addTransaction.mockResolvedValue(true);

      const { user, container } = await scan();
      await user.click(screen.getByRole('button', { name: 'Privat' }));
      // The bank charged its own rate, not ours.
      fireEvent.change(totalInput(container), { target: { value: '1012.40' } });

      await user.click(screen.getByRole('button', { name: 'Зберегти без змін' }));
      await waitFor(() => expect(mocks.addTransaction).toHaveBeenCalled());
      expect(mocks.addTransaction.mock.calls[0][0]).toMatchObject({ amount: 1012.4, currency: 'UAH' });
    });

    it('asks for the figure when the asset cannot be priced', async () => {
      mocks.portfolioAccounts = [
        { accountKey: 'ledger', name: 'Ledger', primaryCurrency: 'ETH', section: 'crypto' },
      ];
      mocks.cryptoPrices = {};
      mocks.scanReceipt.mockResolvedValue(plnReceipt);

      const { user, container } = await scan();
      await user.click(screen.getByRole('button', { name: 'Ledger' }));

      // Guessing how much ETH left the wallet would invent the figure.
      expect(totalInput(container).value).toBe('');
      expect(screen.getByText('scan.amountRateUnavailable')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Зберегти без змін' }).hasAttribute('disabled')).toBe(true);
    });
  });
});
