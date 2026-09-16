import { describe, expect, it } from 'vitest';
import { MCC_CATEGORY, merchantKey, resolveBankCategory } from './bank-category.js';

const CATEGORIES = [
  { id: 'food', name: 'Продукти', type: 'expense' },
  { id: 'transport', name: 'Транспорт', type: 'expense' },
  { id: 'health', name: 'Здоровʼя', type: 'expense' },
  { id: 'other_expense', name: 'Інше', type: 'expense' },
  { id: 'salary', name: 'Зарплата', type: 'income' },
  { id: 'other_income', name: 'Інший дохід', type: 'income' },
];

describe('merchantKey', () => {
  it('зводить один магазин до одного ключа попри регістр і розділювачі', () => {
    expect(merchantKey('BIEDRONKA')).toBe(merchantKey('Biedronka'));
    expect(merchantKey('SILPO-2000')).toBe(merchantKey('Silpo 2000'));
  });

  it('відкидає номер точки, щоб правило працювало в сусідньому магазині', () => {
    // Термінали дописують номер до назви, і без цього правило, вивчене в
    // одному «Сільпо», не спрацювало б у жодному іншому.
    expect(merchantKey('SILPO 0271')).toBe('silpo');
    expect(merchantKey('BIEDRONKA 1234 KRAKOW')).toBe('biedronka krakow');
  });

  it('не чіпає число всередині назви — це вже інший заклад', () => {
    expect(merchantKey('Multiplex 4DX')).toBe('multiplex 4dx');
  });

  it('не зводить назву до порожнього рядка, якщо в ній лише цифри', () => {
    expect(merchantKey('7777')).toBe('7777');
  });

  it('порожнє на вході — порожнє на виході, без падіння', () => {
    expect(merchantKey(null)).toBe('');
    expect(merchantKey('   ')).toBe('');
  });
});

describe('resolveBankCategory', () => {
  it('бере MCC, коли про торговця ще нічого не відомо', () => {
    const result = resolveBankCategory({ merchant: 'ATB', mcc: 5411, categories: CATEGORIES });
    expect(result).toMatchObject({ categoryId: 'food', source: 'mcc' });
  });

  it('правило людини важить більше за MCC', () => {
    // Заправка з кавою має код пального, але той, хто купує там лише каву,
    // має рацію проти таблиці.
    const result = resolveBankCategory({
      merchant: 'OKKO 12',
      mcc: 5541,
      rules: { okko: 'food' },
      categories: CATEGORIES,
    });
    expect(result).toMatchObject({ categoryId: 'food', source: 'rule' });
  });

  it('невідомий MCC падає в «Інше», а не вгадується', () => {
    const result = resolveBankCategory({ merchant: 'Щось нове', mcc: 5944, categories: CATEGORIES });
    expect(result).toMatchObject({ categoryId: 'other_expense', source: 'fallback' });
  });

  it('надходження не потрапляє у витратну категорію', () => {
    // MCC у переказу теж буває, і без перевірки напрямку зарплата лягла б у
    // «Продукти» — з мінусом у звіті там, де мав бути плюс.
    const result = resolveBankCategory({
      merchant: 'Roboczy',
      mcc: 5411,
      type: 'income',
      categories: CATEGORIES,
    });
    expect(result).toMatchObject({ categoryId: 'other_income', source: 'fallback' });
  });

  it('правило чужого напрямку ігнорується', () => {
    const result = resolveBankCategory({
      merchant: 'Sklep',
      type: 'expense',
      rules: { sklep: 'salary' },
      categories: CATEGORIES,
    });
    expect(result.categoryId).toBe('other_expense');
  });

  it('категорія, якої більше немає в списку, не потрапляє в транзакцію', () => {
    const result = resolveBankCategory({
      merchant: 'Sklep',
      rules: { sklep: 'custom:%D0%9A%D0%B0%D0%B2%D0%B0|Coffee|%237C5CFF' },
      categories: CATEGORIES,
    });
    expect(result.categoryId).toBe('other_expense');
  });

  it('порожній список категорій не губить операцію', () => {
    const result = resolveBankCategory({ merchant: 'Sklep', categories: [] });
    expect(result.categoryId).toBe('other_expense');
  });

  it('у таблиці MCC немає кодів поза межами ISO 18245', () => {
    for (const code of Object.keys(MCC_CATEGORY)) {
      expect(Number(code)).toBeGreaterThanOrEqual(1000);
      expect(Number(code)).toBeLessThanOrEqual(9999);
    }
  });
});
