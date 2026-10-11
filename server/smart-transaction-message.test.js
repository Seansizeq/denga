import { describe, expect, it } from 'vitest';
import {
  buildSmartConfirmationMessage,
  buildSmartConfirmationPayload,
  buildSmartMissText,
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

describe('buildSmartMissText', () => {
  it('says the recognizer failed when there is no answer at all', () => {
    expect(buildSmartMissText(null)).toContain('Не вдалося розпізнати');
    expect(buildSmartMissText(undefined)).toContain('Не вдалося розпізнати');
  });

  it('shows how to write it when the model saw no transaction', () => {
    expect(buildSmartMissText({ isTransaction: false })).toContain('«кава 55»');
  });

  it('stays out of the way when there will be a card', () => {
    expect(buildSmartMissText({ isTransaction: true, amount: 55 })).toBeNull();
  });
});

describe('картка, що дозаповнює рахунок і категорію', () => {
  const accountOptions = [
    { key: 'mono', name: 'monobank', section: 'bank', currency: 'UAH' },
    { key: 'cash', name: 'Готівка', section: 'cash', currency: 'UAH' },
    { key: 'pumb', name: 'ПУМБ', section: 'bank', currency: 'UAH' },
  ];
  const categoryOptions = [
    { id: 'food', name: 'Продукти' },
    { id: 'other_expense', name: 'Інше' },
  ];
  const card = {
    amount: 36,
    currency: 'UAH',
    type: 'expense',
    categoryId: 'food',
    categoryName: 'Продукти',
    accountKey: null,
    note: 'булочка',
    date: '2026-10-11',
    accountOptions,
    categoryOptions,
  };
  const callbacks = (keyboard) => keyboard.inline_keyboard.flat().map((button) => button.callback_data);

  it('asks for the account under the card and offers only accounts to pick', () => {
    expect(buildSmartConfirmationMessage(card, { today: '2026-10-11' })).toBe(
      '36 ₴ · Витрата\nПродукти\nБулочка\nСьогодні\n💳 З якого рахунку? Оберіть нижче.',
    );
    const keyboard = buildSmartTransactionKeyboard({}, card);
    expect(keyboard.inline_keyboard[0]).toEqual([
      { text: '💳 monobank', callback_data: 'smart_acc:0' },
      { text: '💵 Готівка', callback_data: 'smart_acc:1' },
    ]);
    expect(callbacks(keyboard)).toEqual(['smart_acc:0', 'smart_acc:1', 'smart_acc:2', 'smart_cancel']);
  });

  it('asks where income landed in its own words', () => {
    expect(buildSmartConfirmationMessage({ ...card, type: 'income' })).toContain('💳 На який рахунок?');
  });

  it('asks for the category when the model only managed «Інше»', () => {
    const missingCategory = { ...card, accountKey: 'mono', accountName: 'monobank', categoryId: 'other_expense', categoryName: 'Інше' };
    expect(buildSmartConfirmationMessage(missingCategory)).toContain('🏷 Яка категорія? Оберіть нижче.');
    expect(callbacks(buildSmartTransactionKeyboard({}, missingCategory))).toEqual([
      'smart_cat:0',
      'smart_cat:1',
      'smart_cancel',
    ]);
  });

  it('saves a full card and lets the person change what the bot filled in', () => {
    const full = { ...card, accountKey: 'mono', accountName: 'monobank' };
    expect(buildSmartConfirmationMessage(full, { today: '2026-10-11' })).toBe(
      '36 ₴ · Витрата\nПродукти · monobank\nБулочка\nСьогодні',
    );
    expect(buildSmartTransactionKeyboard({}, full).inline_keyboard).toEqual([
      [
        { text: '✅ Зберегти', callback_data: 'smart_save' },
        { text: '✏️ Змінити', callback_data: 'smart_edit' },
      ],
      [
        { text: '💳 Рахунок', callback_data: 'smart_pick:account' },
        { text: '🏷 Категорія', callback_data: 'smart_pick:category' },
      ],
      [{ text: 'Скасувати', callback_data: 'smart_cancel' }],
    ]);
  });

  it('ticks the current choice and offers a way back in a list opened by hand', () => {
    const reopened = { ...card, accountKey: 'cash', accountName: 'Готівка', picking: 'account' };
    const keyboard = buildSmartTransactionKeyboard({}, reopened);
    expect(keyboard.inline_keyboard[0][1].text).toBe('✓ 💵 Готівка');
    expect(keyboard.inline_keyboard.at(-1)).toEqual([
      { text: '← Назад', callback_data: 'smart_back' },
      { text: 'Скасувати', callback_data: 'smart_cancel' },
    ]);
  });
});
