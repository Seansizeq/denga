import { describe, expect, it } from 'vitest';
import {
  contributionInGoalCurrency,
  freezeContributionConversion,
  sumGoalContributions,
} from './goal-progress.js';

/** UAH -> USD за курсом 40, назад — 1/40. Решта пар — тождинні. */
const convert = (amount, from, to) => {
  if (from === to) return amount;
  if (from === 'UAH' && to === 'USD') return amount / 40;
  if (from === 'USD' && to === 'UAH') return amount * 40;
  return amount;
};

describe('contributionInGoalCurrency', () => {
  it('бере зафіксовану суму, а не рахує наживо', () => {
    // 8000 UAH за поточним курсом — це 200 USD, але внесок зроблено за іншим
    // курсом. Прогрес мусить лишитися тим, що зафіксували.
    const row = { amount: 8000, currency: 'UAH', convertedAmount: 178.97 };
    expect(contributionInGoalCurrency(row, 'USD', convert)).toBe(178.97);
  });

  it('зафіксований нуль лишається нулем', () => {
    const row = { amount: 0, currency: 'UAH', convertedAmount: 0 };
    expect(contributionInGoalCurrency(row, 'USD', convert)).toBe(0);
  });

  it('конвертує наживо, коли конверсії ще не зафіксовано (NULL)', () => {
    // Головний регрес: `Number(null)` — це 0, а `Number.isFinite(0)` — true.
    // Через це NULL проходив за «збережений нуль», і кожен давній внесок
    // обнулявся, лишаючи від цілі одну стартову суму.
    const row = { amount: 8000, currency: 'UAH', convertedAmount: null };
    expect(contributionInGoalCurrency(row, 'USD', convert)).toBe(200);
  });

  it('конвертує наживо, коли колонки взагалі немає', () => {
    const row = { amount: 8000, currency: 'UAH' };
    expect(contributionInGoalCurrency(row, 'USD', convert)).toBe(200);
  });

  it('однаковалютний legacy-внесок лишається собою, а не нулем', () => {
    const row = { amount: 500, currency: 'USD', convertedAmount: null };
    expect(contributionInGoalCurrency(row, 'USD', convert)).toBe(500);
  });

  it('падає на валюту цілі, якщо валюти внеску немає', () => {
    const row = { amount: 500, currency: null, convertedAmount: null };
    expect(contributionInGoalCurrency(row, 'USD', convert)).toBe(500);
  });

  it('ігнорує сміття в збереженій сумі й конвертує наживо', () => {
    const row = { amount: 8000, currency: 'UAH', convertedAmount: 'дуже багато' };
    expect(contributionInGoalCurrency(row, 'USD', convert)).toBe(200);
  });
});

describe('sumGoalContributions', () => {
  it('додає стартову суму без конверсії — вона вже у валюті цілі', () => {
    expect(sumGoalContributions([], 'USD', convert, 1500)).toBe(1500);
  });

  it('складає різні валюти через конверсію, а не як голі числа', () => {
    const rows = [
      { amount: 8000, currency: 'UAH', convertedAmount: 200 },
      { amount: 300, currency: 'USD', convertedAmount: 300 },
    ];
    // Голий SUM дав би 8300 — саме так і помилявся ботовий нудж.
    expect(sumGoalContributions(rows, 'USD', convert, 1500)).toBe(2000);
  });

  it('змішує зафіксовані й legacy-рядки', () => {
    const rows = [
      { amount: 8000, currency: 'UAH', convertedAmount: 178.97 },
      { amount: 4000, currency: 'UAH', convertedAmount: null },
    ];
    expect(sumGoalContributions(rows, 'USD', convert, 0)).toBeCloseTo(278.97, 5);
  });

  it('не падає на порожньому вводі', () => {
    expect(sumGoalContributions(null, 'USD', convert)).toBe(0);
    expect(sumGoalContributions(undefined, 'USD', convert, 10)).toBe(10);
  });
});

describe('freezeContributionConversion', () => {
  it('віддає суму й курс, за яким її отримали', () => {
    expect(freezeContributionConversion(8000, 'UAH', 'USD', convert)).toEqual({
      converted: 200,
      rate: 1 / 40,
    });
  });

  it('однакова валюта — курс один', () => {
    expect(freezeContributionConversion(500, 'USD', 'USD', convert)).toEqual({ converted: 500, rate: 1 });
  });

  it('не ділить на нуль на нульовій сумі', () => {
    expect(freezeContributionConversion(0, 'UAH', 'USD', convert)).toEqual({ converted: 0, rate: 1 });
  });
});
