import { describe, expect, it } from 'vitest';
import {
  extractCustomEmojiReferences,
  formatSmartTransactionEmojiSetup,
  readSmartTransactionEmojiIds,
} from './telegram-premium-emoji.js';

describe('Telegram premium emoji configuration', () => {
  it('reads only valid numeric custom emoji IDs', () => {
    expect(readSmartTransactionEmojiIds({
      TELEGRAM_EMOJI_EXPENSE_ID: ' 5368324170671202286 ',
      TELEGRAM_EMOJI_INCOME_ID: 'not-an-id',
      TELEGRAM_EMOJI_SAVE_ID: '5370740712479445942',
    })).toEqual({
      expense: '5368324170671202286',
      save: '5370740712479445942',
    });
  });

  it('extracts and de-duplicates custom emoji IDs from a replied-to message', () => {
    expect(extractCustomEmojiReferences({
      text: '/emoji_ids',
      reply_to_message: {
        text: '💸 💰 💸',
        entities: [
          { type: 'custom_emoji', offset: 0, length: 2, custom_emoji_id: '111' },
          { type: 'custom_emoji', offset: 3, length: 2, custom_emoji_id: '222' },
          { type: 'custom_emoji', offset: 6, length: 2, custom_emoji_id: '111' },
        ],
      },
    })).toEqual([
      { emoji: '💸', id: '111' },
      { emoji: '💰', id: '222' },
    ]);
  });

  it('formats five emoji IDs as deployable environment variables', () => {
    const references = ['101', '102', '103', '104', '105'].map((id) => ({ emoji: '✨', id }));
    expect(formatSmartTransactionEmojiSetup(references)).toBe([
      'Готові налаштування (перші 5 емодзі):',
      'TELEGRAM_EMOJI_EXPENSE_ID=101',
      'TELEGRAM_EMOJI_INCOME_ID=102',
      'TELEGRAM_EMOJI_SAVE_ID=103',
      'TELEGRAM_EMOJI_EDIT_ID=104',
      'TELEGRAM_EMOJI_CANCEL_ID=105',
    ].join('\n'));
  });
});
