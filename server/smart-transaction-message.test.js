import { describe, expect, it } from 'vitest';
import {
  buildSmartConfirmationMessage,
  buildSmartConfirmationPayload,
  buildSmartSavedMessage,
  buildSmartSavedPayload,
  buildSmartTransactionKeyboard,
  formatSmartAmount,
  formatSmartDate,
  parseSmartDebtCallback,
} from './smart-transaction-message.js';

const transaction = {
  amount: 400,
  currency: 'UAH',
  type: 'expense',
  categoryId: 'tech',
  categoryName: 'Техніка',
  accountName: 'Готівка',
  note: 'геймпад',
  date: '2026-08-23',
};

describe('smart Telegram transaction card', () => {
  it('renders the compact confirmation requested by the product UI', () => {
    expect(buildSmartConfirmationMessage(transaction, { today: '2026-08-23' })).toBe(
      '400 ₴ · Витрата\nТехніка · Готівка\nГеймпад\nСьогодні',
    );
  });

  it('renders income and omits an account that was not selected', () => {
    expect(buildSmartConfirmationMessage({
      ...transaction,
      amount: 5200.5,
      currency: 'PLN',
      type: 'income',
      categoryName: 'Зарплата',
      accountName: null,
      note: 'зарплата',
    }, { today: '2026-08-23' })).toBe(
      '5 200,5 zł · Дохід\nЗарплата\nЗарплата\nСьогодні',
    );
  });

  it('uses friendly relative and calendar dates', () => {
    expect(formatSmartDate('2026-08-22', '2026-08-23')).toBe('Вчора');
    expect(formatSmartDate('2026-08-20', '2026-08-23')).toBe('20 серпня');
    expect(formatSmartDate('2025-12-31', '2026-08-23')).toBe('31 грудня 2025');
  });

  it('uses familiar currency symbols and the minimal saved state', () => {
    expect(formatSmartAmount(37, 'PLN')).toBe('37 zł');
    expect(formatSmartAmount(12.5, 'USD')).toBe('12,5 $');
    expect(buildSmartSavedMessage(transaction)).toBe('✅ 400 ₴ · Техніка — збережено');
  });

  it('places save and edit together, with cancel on its own row', () => {
    expect(buildSmartTransactionKeyboard()).toEqual({
      inline_keyboard: [
        [
          { text: '✅ Зберегти', callback_data: 'smart_save' },
          { text: '✏️ Змінити', callback_data: 'smart_edit' },
        ],
        [{ text: 'Скасувати', callback_data: 'smart_cancel' }],
      ],
    });
  });

  it('adds native custom emoji entities without changing the compact layout', () => {
    expect(buildSmartConfirmationPayload(transaction, {
      today: '2026-08-23',
      emojiIds: { expense: '5368324170671202286' },
    })).toEqual({
      text: '💸 400 ₴ · Витрата\nТехніка · Готівка\nГеймпад\nСьогодні',
      entities: [{
        type: 'custom_emoji',
        offset: 0,
        length: 2,
        custom_emoji_id: '5368324170671202286',
      }],
    });
    expect(buildSmartSavedPayload(transaction, {
      emojiIds: { save: '5370740712479445942' },
    }).entities).toEqual([{
      type: 'custom_emoji',
      offset: 0,
      length: 1,
      custom_emoji_id: '5370740712479445942',
    }]);
  });

  it('uses premium icons on configured inline buttons', () => {
    expect(buildSmartTransactionKeyboard({
      save: '101',
      edit: '102',
      cancel: '103',
    })).toEqual({
      inline_keyboard: [
        [
          { text: 'Зберегти', icon_custom_emoji_id: '101', callback_data: 'smart_save' },
          { text: 'Змінити', icon_custom_emoji_id: '102', callback_data: 'smart_edit' },
        ],
        [{ text: 'Скасувати', icon_custom_emoji_id: '103', callback_data: 'smart_cancel' }],
      ],
    });
  });
});

describe('повернення боргу в чаті', () => {
  const debtOptions = [
    { key: 'debt_misha', name: 'Михайло', balance: 1000, currency: 'UAH' },
    { key: 'debt_olia', name: 'Оля', balance: 250, currency: 'USD' },
  ];
  const repayment = {
    amount: 300,
    currency: 'UAH',
    type: 'income',
    categoryId: 'debt_return',
    categoryName: 'Повернення боргу',
    accountName: 'ПУМБ',
    date: '2026-10-11',
    debtOptions,
  };

  it('asks whose debt it was when none is picked yet', () => {
    expect(buildSmartConfirmationMessage(repayment, { today: '2026-10-11' })).toContain('Чий борг повернули?');
  });

  it('names the picked debt and what it stands at now', () => {
    const text = buildSmartConfirmationMessage({ ...repayment, debtAccountKey: 'debt_misha' }, { today: '2026-10-11' });
    // Intl ділить тисячі вузьким нерозривним пробілом.
    expect(text.split('\n').at(-1).replace(/\s/g, ' ')).toBe('🤝 Борг: Михайло · зараз 1 000 ₴');
  });

  it('hints at the account when the money had nowhere to land', () => {
    const text = buildSmartConfirmationMessage({ ...repayment, debtOptions: undefined, debtHint: true });
    expect(text).toContain('Вкажи рахунок');
  });

  it('puts debt buttons above save, ticks the picked one and offers «Без боргу»', () => {
    const keyboard = buildSmartTransactionKeyboard({}, { debtOptions, debtAccountKey: 'debt_olia' });
    expect(keyboard.inline_keyboard.slice(0, 2)).toEqual([
      [
        { text: 'Михайло', callback_data: 'smart_debt:0' },
        { text: '✓ Оля', callback_data: 'smart_debt:1' },
      ],
      [{ text: 'Без боргу', callback_data: 'smart_debt:none' }],
    ]);
    expect(keyboard.inline_keyboard[2][0].callback_data).toBe('smart_save');
  });

  it('keeps the plain keyboard for everything else', () => {
    expect(buildSmartTransactionKeyboard({}, {})).toEqual(buildSmartTransactionKeyboard());
  });

  it('reads only its own callbacks', () => {
    expect(parseSmartDebtCallback('smart_debt:1')).toEqual({ index: 1 });
    expect(parseSmartDebtCallback('smart_debt:none')).toEqual({ index: null });
    expect(parseSmartDebtCallback('smart_debt:-1')).toBeNull();
    expect(parseSmartDebtCallback('smart_save')).toBeNull();
  });
});
