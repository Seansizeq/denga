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
    const result = resolveBankCategory({ merchant: 'Магазин біля дому', mcc: 5411, categories: CATEGORIES });
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

  it('впізнає мережу з назви, коли MCC немає зовсім', () => {
    // Саме так приходить сповіщення Bybit: назва є, коду немає.
    expect(resolveBankCategory({ merchant: 'JMP S.A. BIEDRONKA 468', categories: CATEGORIES }))
      .toMatchObject({ categoryId: 'food', source: 'brand' });
    expect(resolveBankCategory({ merchant: 'ZABKA Z6914 K.1', categories: CATEGORIES }).categoryId).toBe('food');
    expect(resolveBankCategory({ merchant: 'ŻABKA', categories: CATEGORIES }).categoryId).toBe('food');
    expect(resolveBankCategory({ merchant: 'BIEDRONKA1234', categories: CATEGORIES }).categoryId).toBe('food');
    expect(resolveBankCategory({ merchant: 'PKN ORLEN STACJA 4123', categories: CATEGORIES }).categoryId).toBe('transport');
    expect(resolveBankCategory({ merchant: 'Apteka Dr.Max', categories: CATEGORIES }).categoryId).toBe('health');
  });

  it('доставку їжі не плутає з таксі тієї ж компанії', () => {
    expect(resolveBankCategory({ merchant: 'UBER *EATS', categories: CATEGORIES }).categoryId).toBe('food');
    expect(resolveBankCategory({ merchant: 'UBER *TRIP', categories: CATEGORIES }).categoryId).toBe('transport');
    expect(resolveBankCategory({ merchant: 'BOLT FOOD', categories: CATEGORIES }).categoryId).toBe('food');
    expect(resolveBankCategory({ merchant: 'BOLT.EU/O/2410', categories: CATEGORIES }).categoryId).toBe('transport');
  });

  it('не впізнає мережу в шматку чужого слова', () => {
    expect(resolveBankCategory({ merchant: 'BOLTEX SP Z O O', categories: CATEGORIES }).source).toBe('fallback');
    expect(resolveBankCategory({ merchant: 'DINOZAUR PARK', categories: CATEGORIES }).source).toBe('fallback');
  });

  it('правило людини важить більше за мережу', () => {
    const result = resolveBankCategory({
      merchant: 'ZABKA Z6914',
      rules: { [merchantKey('ZABKA Z6914')]: 'transport' },
      categories: CATEGORIES,
    });
    expect(result).toMatchObject({ categoryId: 'transport', source: 'rule' });
  });

  it('кладе мережу у власну категорію людини, коли така є', () => {
    const own = [
      ...CATEGORIES,
      { id: 'custom:%D0%9E%D0%B4%D1%8F%D0%B3|Shirt|%23000', name: 'Одяг і взуття', type: 'expense' },
      { id: 'custom:%D0%9F%D1%96%D0%B4%D0%BF%D0%B8%D1%81%D0%BA%D0%B8|Tv|%23000', name: 'Підписки', type: 'expense' },
      { id: 'custom:%D0%9A%D0%B0%D0%B2%D0%B0|Coffee|%23000', name: 'Кава', type: 'expense' },
    ];
    expect(resolveBankCategory({ merchant: 'ZARA POLSKA', categories: own }).categoryId).toBe(own[6].id);
    // Код кабельного ТБ сказав би «Житло» — назва точніша.
    expect(resolveBankCategory({ merchant: 'NETFLIX.COM', mcc: 4899, categories: own }).categoryId).toBe(own[7].id);
    expect(resolveBankCategory({ merchant: 'STARBUCKS 12', categories: own }).categoryId).toBe(own[8].id);
  });

  it('без власної категорії бере вбудовану, а якщо й такої нема — мовчить', () => {
    expect(resolveBankCategory({ merchant: 'NETFLIX.COM', categories: CATEGORIES }).categoryId).toBe('other_expense');
    // У тестовому списку немає «Розваг», тож Netflix іде далі по ланцюжку, а не
    // вигадує категорію.
    expect(resolveBankCategory({ merchant: 'STARBUCKS 12', categories: CATEGORIES }).categoryId).toBe('food');
    expect(resolveBankCategory({ merchant: 'ZARA POLSKA', categories: CATEGORIES }).source).toBe('fallback');
  });

  it('у таблиці MCC немає кодів поза межами ISO 18245', () => {
    for (const code of Object.keys(MCC_CATEGORY)) {
      expect(Number(code)).toBeGreaterThanOrEqual(1000);
      expect(Number(code)).toBeLessThanOrEqual(9999);
    }
  });
});
