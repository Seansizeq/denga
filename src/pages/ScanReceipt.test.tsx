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

vi.mock('../i18n/LanguageContext', () => ({
  useTranslation: () => ({
    locale: 'uk-UA',
    language: 'uk',
    t: (section: string, key: string) => {
      const map: Record<string, string> = {
        'scan.close': 'Закрити',
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
});
