import { describe, expect, it } from 'vitest';
import { notificationText, parseBankNotification } from './bank-notification.js';

describe('notificationText', () => {
  it('рядок лишається рядком', () => {
    expect(notificationText('-5Zł(57.67₴) Транспорт. skycash.com')).toBe('-5Zł(57.67₴) Транспорт. skycash.com');
  });

  it('словник від Команд розгортається, і покупку в ньому видно', () => {
    const shortcutsDictionary = {
      title: 'Купівля',
      body: '10.00PLN / 116.42UAH (курс 11.64)\ndoladowania.play.pl Poznan PL\n09-10-2026 23:16\nКартка: *7354',
      app: { name: 'ПУМБ' },
    };
    expect(parseBankNotification(notificationText(shortcutsDictionary))).toMatchObject({ provider: 'pumb', amount: 116.42 });
  });

  it('нічого, крім тексту, — порожньо', () => {
    expect(notificationText(null)).toBe('');
    expect(notificationText(undefined)).toBe('');
    expect(notificationText(42)).toBe('');
    expect(notificationText({})).toBe('');
  });
});

describe('parseBankNotification — Privat24', () => {
  it('покупка у злотих з гривневої картки записується сумою, що пішла з картки', () => {
    // Дослівно пуш Privat24 з телефона.
    const text = '-5Zł(57.67₴) Транспорт. skycash.com, Warszawa\n4*77 00:12\nКешбек 5.77₴...';
    expect(parseBankNotification(text)).toEqual({
      provider: 'privat24',
      type: 'expense',
      amount: 57.67,
      currency: 'UAH',
      merchant: 'skycash.com',
      bankCategory: 'Транспорт',
    });
  });

  it('покупка у валюті картки — без дужок', () => {
    const result = parseBankNotification('-1 250,50₴ Продукти. Silpo, Kyiv\n4*77 12:30\nБал. 3 000.00₴');
    expect(result).toMatchObject({ amount: 1250.5, currency: 'UAH', merchant: 'Silpo', bankCategory: 'Продукти' });
  });

  it('крапки в назві торговця не обривають категорію', () => {
    const result = parseBankNotification('-12.40Zł(140.10₴) Продукти. JMP S.A. BIEDRONKA 468, Krakow');
    expect(result).toMatchObject({ merchant: 'JMP S.A. BIEDRONKA 468', bankCategory: 'Продукти' });
  });

  it('євро з гривневої картки — гривня; євро з євро-картки — валюта, якої облік не веде, лишається як є', () => {
    expect(parseBankNotification('-3€(150.00₴) Кафе. Cafe, Berlin')).toMatchObject({ amount: 150, currency: 'UAH' });
    expect(parseBankNotification('-3€ Кафе. Cafe, Berlin')).toMatchObject({ amount: 3, currency: 'EUR' });
  });

  it('знаходить покупку, навіть коли ярлик переслав заголовок разом із текстом', () => {
    const result = parseBankNotification('Privat24\n-5Zł(57.67₴) Транспорт. skycash.com, Warszawa');
    expect(result).toMatchObject({ amount: 57.67, merchant: 'skycash.com' });
  });

  it('зарахування, відмова й службові пуші покупкою не є', () => {
    expect(parseBankNotification('+500.00₴ Зарахування переказу. Від Іван І., Kyiv')).toBeNull();
    expect(parseBankNotification('Відмова. -5Zł Транспорт. skycash.com: недостатньо коштів')).toBeNull();
    expect(parseBankNotification('Код для входу в Приват24: 1234')).toBeNull();
    expect(parseBankNotification('')).toBeNull();
  });
});

describe('parseBankNotification — ПУМБ', () => {
  // Дослівно текст пуша ПУМБ з телефона (заголовок «Купівля» окремо).
  const PURCHASE = '10.00PLN / 116.42UAH (курс 11.64)\ndoladowania.play.pl Poznan PL\n09-10-2026 23:16\nКартка: *7354';

  it('покупка у злотих з гривневої картки записується сумою, що пішла з картки', () => {
    expect(parseBankNotification(PURCHASE)).toEqual({
      provider: 'pumb',
      type: 'expense',
      amount: 116.42,
      currency: 'UAH',
      merchant: 'doladowania.play.pl',
      bankCategory: null,
    });
  });

  it('покупка у валюті картки — одна сума', () => {
    const result = parseBankNotification('250.00UAH\nSILPO 123 Kyiv UA\n09-10-2026 12:00\nКартка: *7354');
    expect(result).toMatchObject({ amount: 250, currency: 'UAH', merchant: 'SILPO 123' });
  });

  it('заголовок разом із текстом не заважає', () => {
    expect(parseBankNotification(`Купівля\n${PURCHASE}`)).toMatchObject({ amount: 116.42, provider: 'pumb' });
  });

  it('зарахування того самого вигляду пропускається, якщо заголовок приїхав разом із текстом', () => {
    const income = 'Зарахування\n500.00UAH\nIvan I. Kyiv UA\n09-10-2026 12:00\nКартка: *7354';
    expect(parseBankNotification(income)).toBeNull();
  });
});

describe('parseBankNotification — Bybit', () => {
  it('розбирає авторизацію картки', () => {
    const text = 'Authorization of 5.23 USD at JMP S.A. BIEDRONKA 468 was made on 2026-10-06 18:45:20.';
    expect(parseBankNotification(text)).toEqual({
      provider: 'bybit',
      type: 'expense',
      amount: 5.23,
      currency: 'USD',
      merchant: 'JMP S.A. BIEDRONKA 468',
      bankCategory: null,
    });
  });

  it('кома в Bybit — розділювач тисяч, а не десятковий знак', () => {
    const text = 'Authorization of 1,234.56 USD at IKEA KRAKOW was made on 2026-10-06 18:45:20.';
    expect(parseBankNotification(text)).toMatchObject({ amount: 1234.56 });
  });

  it('пуш про кешбек покупкою не є', () => {
    expect(parseBankNotification('Вы можете получить кэшбэк в размере ~0.10 USDT.')).toBeNull();
  });
});
