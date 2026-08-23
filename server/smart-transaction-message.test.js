import { describe, expect, it } from 'vitest';
import {
  buildSmartConfirmationMessage,
  buildSmartConfirmationPayload,
  buildSmartSavedMessage,
  buildSmartSavedPayload,
  buildSmartTransactionKeyboard,
  formatSmartAmount,
  formatSmartDate,
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
