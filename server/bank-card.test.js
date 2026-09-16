import { describe, expect, it } from 'vitest';
import {
  BANK_CARD_CATEGORY_LIMIT,
  bankCallbackData,
  buildBankCardKeyboard,
  buildBankCardResult,
  buildBankCardText,
  buildBankCategoryKeyboard,
  createBankCardId,
  parseBankCallback,
} from './bank-card.js';

/** Стеля Telegram на `callback_data`. Перевищення — мовчазна відмова кнопки. */
const CALLBACK_LIMIT = 64;

const categories = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, name: `Категорія ${i}` }));

describe('createBankCardId', () => {
  it('дає короткий id, придатний для кнопки', () => {
    const id = createBankCardId(() => 0.5);
    expect(id).toMatch(/^[0-9a-z]{10}$/);
  });
});

describe('parseBankCallback', () => {
  it('розбирає те, що сам і склав', () => {
    expect(parseBankCallback(bankCallbackData('categories', 'abc'))).toEqual({
      action: 'categories',
      cardId: 'abc',
      index: null,
    });
    expect(parseBankCallback(bankCallbackData('pick', 'abc', 7))).toEqual({
      action: 'pick',
      cardId: 'abc',
      index: 7,
    });
  });

  it('чуже не привласнює', () => {
    // Обробник вибирається саме за цією перевіркою, тож «так» на чужі дані
    // з'їло б кнопки звітів або розумного додавання.
    expect(parseBankCallback('smart_save')).toBeNull();
    expect(parseBankCallback('rep_toggle_weekly')).toBeNull();
    expect(parseBankCallback('bk:z:abc')).toBeNull();
    expect(parseBankCallback('bk:p')).toBeNull();
    expect(parseBankCallback(undefined)).toBeNull();
  });

  it('номер, який не число, не стає нулем', () => {
    // Інакше зіпсована кнопка тихо обрала б першу категорію зі списку.
    expect(parseBankCallback('bk:p:abc:x')).toBeNull();
  });
});

describe('клавіатури', () => {
  it('усі кнопки вкладаються в межу Telegram', () => {
    const cardId = createBankCardId(() => 0.99);
    const all = [
      ...buildBankCardKeyboard(cardId).inline_keyboard.flat(),
      ...buildBankCategoryKeyboard(cardId, categories).inline_keyboard.flat(),
    ];
    for (const button of all) {
      expect(Buffer.byteLength(button.callback_data, 'utf8')).toBeLessThanOrEqual(CALLBACK_LIMIT);
    }
  });

  it('пікер не розтягується довше за межу', () => {
    const rows = buildBankCategoryKeyboard('abc', categories).inline_keyboard;
    const picks = rows.flat().filter((b) => b.callback_data.startsWith('bk:p:'));
    expect(picks).toHaveLength(BANK_CARD_CATEGORY_LIMIT);
  });

  it('номер кнопки збігається з позицією категорії у списку', () => {
    const picks = buildBankCategoryKeyboard('abc', categories).inline_keyboard.flat()
      .filter((b) => b.callback_data.startsWith('bk:p:'));
    expect(parseBankCallback(picks[5].callback_data).index).toBe(5);
    expect(picks[5].text).toBe('Категорія 5');
  });

  it('із пікера завжди є вихід без змін', () => {
    const rows = buildBankCategoryKeyboard('abc', categories).inline_keyboard;
    expect(parseBankCallback(rows[rows.length - 1][0].callback_data).action).toBe('keep');
  });
});

describe('buildBankCardText', () => {
  it('показує суму, торговця, категорію й рахунок одним рядком опису', () => {
    const text = buildBankCardText({
      merchant: 'Silpo',
      amount: 340,
      currency: 'UAH',
      categoryName: 'Продукти',
      accountName: 'Картка',
      source: 'mcc',
    });
    expect(text).toContain('Silpo');
    expect(text).toContain('340');
    expect(text).toContain('Продукти');
    expect(text).toContain('Картка');
  });

  it('мовчить про здогад, коли категорію дало правило самої людини', () => {
    const text = buildBankCardText({ merchant: 'Silpo', amount: 1, currency: 'UAH', categoryName: 'Продукти', source: 'rule' });
    expect(text).not.toContain('↪️');
  });

  it('каже, що категорію вгадано, коли її ніхто не підтверджував', () => {
    const text = buildBankCardText({ merchant: 'Silpo', amount: 1, currency: 'UAH', categoryName: 'Продукти', source: 'mcc' });
    expect(text).toContain('↪️');
  });

  it('надходження не підписане як витрата', () => {
    const text = buildBankCardText({ merchant: 'Зарплата', amount: 1, currency: 'UAH', categoryName: 'Зарплата', type: 'income' });
    expect(text).toContain('Надходження');
  });
});

describe('buildBankCardResult', () => {
  it('підсумок збереженого показує підсумкову категорію', () => {
    expect(buildBankCardResult({ merchant: 'Silpo', amount: 340, currency: 'UAH', categoryName: 'Продукти' }))
      .toContain('Продукти');
  });

  it('прибране підписане так, щоб не сплутати зі збереженим', () => {
    const text = buildBankCardResult({ merchant: 'Silpo', amount: 340, currency: 'UAH', dropped: true });
    expect(text).toContain('🗑');
    expect(text).not.toContain('✅');
  });
});
