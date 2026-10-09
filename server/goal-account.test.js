import { describe, expect, it } from 'vitest';
import {
  GOAL_ACCOUNT_KEY_MAX,
  GOAL_SECTION,
  USER_CREATABLE_SECTIONS,
  goalAccountKey,
  goalAccountName,
  planGoalRefund,
  rebaseGoalAccount,
  shrinkContribution,
} from './goal-account.js';

/** 1 USD = 40 UAH = 4 PLN — круглі числа, щоб перевірка читалась очима. */
const RATES = { USD: 1, UAH: 40, PLN: 4 };
const convert = (amount, from, to) => (amount / RATES[from]) * RATES[to];

describe('rebaseGoalAccount', () => {
  it('зміна валюти переводить баланс за курсом, а не лише міняє підпис', () => {
    const out = rebaseGoalAccount({
      balance: 40000,
      previousCurrency: 'UAH',
      nextCurrency: 'USD',
      previousBaseline: 0,
      requestedBaseline: 0,
      convert,
    });
    expect(out).toEqual({ balance: 1000, baseline: 0 });
  });

  it('незмінена стартова сума переводиться разом із балансом', () => {
    const out = rebaseGoalAccount({
      balance: 6000,
      previousCurrency: 'UAH',
      nextCurrency: 'USD',
      previousBaseline: 4000,
      requestedBaseline: 4000,
      convert,
    });
    expect(out).toEqual({ balance: 150, baseline: 100 });
  });

  it('нова стартова сума — уже в новій валюті, різниця лягає на баланс', () => {
    const out = rebaseGoalAccount({
      balance: 6000,
      previousCurrency: 'UAH',
      nextCurrency: 'USD',
      previousBaseline: 4000,
      requestedBaseline: 120,
      convert,
    });
    // 6000 ₴ = 150 $, стара стартова 4000 ₴ = 100 $, нова 120 $ → +20 $.
    expect(out).toEqual({ balance: 170, baseline: 120 });
  });

  it('без зміни валюти працює як раніше: різниця стартової суми — на баланс', () => {
    const out = rebaseGoalAccount({
      balance: 500,
      previousCurrency: 'PLN',
      nextCurrency: 'PLN',
      previousBaseline: 100,
      requestedBaseline: 150,
      convert,
    });
    expect(out).toEqual({ balance: 550, baseline: 150 });
  });
});

describe('planGoalRefund', () => {
  const contributions = [
    { id: 'mar', goalDelta: 100 },
    { id: 'feb', goalDelta: 100 },
    { id: 'jan', goalDelta: 100 },
  ];

  it('нічого не витрачено — повертаються всі внески, як і раніше', () => {
    expect(planGoalRefund(contributions, 300)).toEqual({ refundIds: ['mar', 'feb', 'jan'], partial: null });
  });

  it('стартова сума в балансі не заважає повернути всі внески', () => {
    expect(planGoalRefund(contributions, 1300)).toEqual({ refundIds: ['mar', 'feb', 'jan'], partial: null });
  });

  it('частину витрачено — повертається рівно залишок, починаючи з найновішого', () => {
    expect(planGoalRefund(contributions, 150)).toEqual({
      refundIds: ['mar'],
      partial: { id: 'feb', share: 0.5 },
    });
  });

  it('усе витрачено — повертати нічого', () => {
    expect(planGoalRefund(contributions, 0)).toEqual({ refundIds: [], partial: null });
    expect(planGoalRefund(contributions, -20)).toEqual({ refundIds: [], partial: null });
  });

  it('копійки округлення не роблять із повного повернення часткове', () => {
    expect(planGoalRefund(contributions, 299.995).refundIds).toEqual(['mar', 'feb', 'jan']);
  });

  it('ціль без рахунку повертає все, як і раніше', () => {
    expect(planGoalRefund(contributions, Infinity).refundIds).toEqual(['mar', 'feb', 'jan']);
  });
});

describe('shrinkContribution', () => {
  it('обидві сторони переказу зменшуються в одній пропорції', () => {
    const out = shrinkContribution({ id: 't', amount: 4000, transferToAmount: 100 }, 0.25);
    expect(out).toMatchObject({ id: 't', amount: 1000, transferToAmount: 25 });
  });

  it('дохід без другої сторони зменшує лише суму', () => {
    const out = shrinkContribution({ id: 't', amount: 90, transferToAmount: null }, 1 / 3);
    expect(out).toMatchObject({ amount: 30, transferToAmount: null });
  });

  it('записана в одиниці рахунку сума зменшується в тій самій частці', () => {
    const out = shrinkContribution({ id: 't', type: 'income', amount: 100, accountAmount: 1147.48, accountCurrency: 'UAH' }, 0.5);
    expect(out).toMatchObject({ amount: 50, accountAmount: 573.74, accountCurrency: 'UAH' });
  });
});

/**
 * Той самий маркер, яким рахунок їде в примітці доходу чи витрати
 * (`transaction-effects.js`). Межа в 48 символів тут не косметична: ключ,
 * довший за неї, просто не розпізнається, і транзакція втрачає рахунок.
 */
const ACCOUNT_NOTE_RE = /\bAccount:\s*([a-z0-9_]{1,48})\b/i;

describe('goalAccountKey', () => {
  it('тримається межі, яку розпізнає маркер у примітці', () => {
    const key = goalAccountKey('123456789', 'b467ac24-4cfd-4f55-9ecb-2f99631048a9');
    expect(key.length).toBeLessThanOrEqual(GOAL_ACCOUNT_KEY_MAX);
    expect(ACCOUNT_NOTE_RE.exec(`Ціль: Авто Account: ${key}`)?.[1]).toBe(key);
  });

  it('не вилазить за межу навіть на дуже довгому id користувача', () => {
    const key = goalAccountKey('1234567890123456789012345678901234567890', 'b467ac24-4cfd-4f55-9ecb-2f99631048a9');
    expect(key.length).toBeLessThanOrEqual(GOAL_ACCOUNT_KEY_MAX);
  });

  it('складається лише з символів, які маркер приймає', () => {
    const key = goalAccountKey('tg-user 42', 'b467ac24-4cfd');
    expect(key).toMatch(/^[a-z0-9_]+$/);
  });

  it('стабільний: та сама ціль дає той самий ключ', () => {
    const a = goalAccountKey('42', 'b467ac24-4cfd-4f55');
    const b = goalAccountKey('42', 'b467ac24-4cfd-4f55');
    expect(a).toBe(b);
  });

  it('різні цілі одного користувача не збігаються', () => {
    const a = goalAccountKey('42', 'aaaaaaaa-1111-2222-3333-444444444444');
    const b = goalAccountKey('42', 'bbbbbbbb-1111-2222-3333-444444444444');
    expect(a).not.toBe(b);
  });
});

describe('goalAccountName', () => {
  it('обрізає назву до межі назв рахунків', () => {
    expect(goalAccountName('x'.repeat(60)).length).toBe(40);
  });

  it('порожня назва не лишає рахунок безіменним', () => {
    expect(goalAccountName('   ')).toBe('Ціль');
    expect(goalAccountName(null)).toBe('Ціль');
  });
});

describe('секції', () => {
  it('рахунок цілі не входить у те, що користувач створює сам', () => {
    // Інакше в гаманці міг би з'явитися рахунок цілі без цілі за ним.
    expect(USER_CREATABLE_SECTIONS).not.toContain(GOAL_SECTION);
  });
});
