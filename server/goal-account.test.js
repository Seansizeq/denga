import { describe, expect, it } from 'vitest';
import { GOAL_ACCOUNT_KEY_MAX, GOAL_SECTION, USER_CREATABLE_SECTIONS, goalAccountKey, goalAccountName } from './goal-account.js';

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
