import { describe, expect, it } from 'vitest';
import {
  compareSubscriptionCharge,
  findBankOperationForCharge,
  findChargeForBankOperation,
  matchWindow,
  subscriptionNameMatches,
} from './subscription-match.js';

// 1 USD = 40 ₴ = 4 zł — як у наскрізних тестах.
const RATES = { USD: 1, UAH: 40, PLN: 4 };
const convert = (amount, from, to) => (amount / RATES[from]) * RATES[to];

const netflix = (over = {}) => ({ name: 'Netflix', amount: 15.49, currency: 'USD', chargeDate: '2026-10-15', ...over });
const bank = (over = {}) => ({ merchant: 'NETFLIX.COM', amount: 15.49, currency: 'USD', day: '2026-10-15', ...over });

describe('subscriptionNameMatches', () => {
  it('впізнає сервіс у назві з доменом, містом і номером', () => {
    expect(subscriptionNameMatches('Netflix', 'NETFLIX.COM AMSTERDAM')).toBe(true);
    expect(subscriptionNameMatches('Spotify', 'Spotify P2A8F1C0D')).toBe(true);
    expect(subscriptionNameMatches('Spotify Premium', 'SPOTIFYAB')).toBe(true);
    expect(subscriptionNameMatches('Claude', 'CLAUDE.AI SUBSCRIPTION')).toBe(true);
    expect(subscriptionNameMatches('HBO Max', 'HBO MAX 0042')).toBe(true);
  });

  it('знає, під чиїм імʼям списують ChatGPT, Gemini й YouTube', () => {
    expect(subscriptionNameMatches('ChatGPT', 'OpenAI')).toBe(true);
    expect(subscriptionNameMatches('ChatGPT Plus', 'OPENAI *CHATGPT SUBSCR')).toBe(true);
    expect(subscriptionNameMatches('Claude Pro', 'Anthropic')).toBe(true);
    expect(subscriptionNameMatches('YouTube Premium', 'Google YouTube')).toBe(true);
    expect(subscriptionNameMatches('Gemini', 'GOOGLE *Google One')).toBe(true);
  });

  it('не впізнає за назвою тарифу чи випадковим шматком слова', () => {
    // «Premium» — тариф, а не сервіс.
    expect(subscriptionNameMatches('Spotify Premium', 'Premium Pizza')).toBe(false);
    // Трилітерне слово — лише цілим.
    expect(subscriptionNameMatches('HBO', 'SHBOX STORE')).toBe(false);
    // Назва з одних коротких чи тарифних слів не впізнає нічого.
    expect(subscriptionNameMatches('X', 'XBOX LIVE')).toBe(false);
    expect(subscriptionNameMatches('Pro Plus', 'PRO PLUS SHOP')).toBe(false);
    expect(subscriptionNameMatches('Netflix', 'Biedronka')).toBe(false);
    expect(subscriptionNameMatches('Netflix', '')).toBe(false);
  });
});

describe('compareSubscriptionCharge', () => {
  it('та сама сума, той самий день — одне й те саме списання', () => {
    expect(compareSubscriptionCharge(netflix(), bank(), convert)).toEqual({ amountGap: 0, dayGap: 0 });
  });

  it('гривні з картки за долари підписки — з поправкою на курс банку', () => {
    // 15.49 × 40 = 619.6 ₴; банк узяв на 3 % більше.
    const score = compareSubscriptionCharge(netflix(), bank({ amount: 638.2, currency: 'UAH' }), convert);
    expect(score?.amountGap).toBeCloseTo(0.029, 3);
  });

  it('банк списав на три дні раніше чи пізніше — ще та сама підписка, на чотири — вже ні', () => {
    expect(compareSubscriptionCharge(netflix(), bank({ day: '2026-10-12' }), convert)?.dayGap).toBe(3);
    expect(compareSubscriptionCharge(netflix(), bank({ day: '2026-10-18' }), convert)?.dayGap).toBe(3);
    expect(compareSubscriptionCharge(netflix(), bank({ day: '2026-10-19' }), convert)).toBeNull();
    expect(compareSubscriptionCharge(netflix(), bank({ day: '2026-10-11' }), convert)).toBeNull();
  });

  it('сума далі за 10 % — інші гроші', () => {
    expect(compareSubscriptionCharge(netflix(), bank({ amount: 22.99 }), convert)).toBeNull();
    expect(compareSubscriptionCharge(netflix(), bank({ amount: 16.9 }), convert)).not.toBeNull();
  });

  it('сума й день без назви — не доказ', () => {
    expect(compareSubscriptionCharge(netflix(), bank({ merchant: 'Kawiarnia' }), convert)).toBeNull();
  });

  it('без курсу між валютами не зводить, а не вгадує', () => {
    expect(compareSubscriptionCharge(netflix(), bank({ amount: 619.6, currency: 'UAH' }), () => null)).toBeNull();
  });
});

describe('пошук пари', () => {
  it('операція з банку обирає найближче за сумою автосписання', () => {
    const charges = [
      { id: 'one', name: 'Google One', amount: 2.99, currency: 'USD', chargeDate: '2026-10-14' },
      { id: 'yt', name: 'YouTube Premium', amount: 13.99, currency: 'USD', chargeDate: '2026-10-15' },
    ];
    expect(findChargeForBankOperation(bank({ merchant: 'GOOGLE *YouTubePremium', amount: 13.99 }), charges, convert)?.id).toBe('yt');
    expect(findChargeForBankOperation(bank({ merchant: 'Google', amount: 2.99 }), charges, convert)?.id).toBe('one');
    expect(findChargeForBankOperation(bank({ merchant: 'Google', amount: 50 }), charges, convert)).toBeNull();
  });

  it('списання підписки знаходить свою операцію серед інших покупок', () => {
    const ops = [
      { id: 'coffee', merchant: 'Starbucks', amount: 15.49, currency: 'USD', day: '2026-10-15' },
      { id: 'early', merchant: 'NETFLIX.COM', amount: 15.49, currency: 'USD', day: '2026-10-13' },
      { id: 'exact', merchant: 'NETFLIX.COM', amount: 15.49, currency: 'USD', day: '2026-10-15' },
    ];
    expect(findBankOperationForCharge(netflix(), ops, convert)?.id).toBe('exact');
    expect(findBankOperationForCharge(netflix(), ops.slice(0, 2), convert)?.id).toBe('early');
    expect(findBankOperationForCharge(netflix(), ops.slice(0, 1), convert)).toBeNull();
  });

  it('вікно пошуку — три дні в обидва боки, через межу місяця', () => {
    expect(matchWindow('2026-10-01')).toEqual(['2026-09-28', '2026-10-04']);
  });
});
