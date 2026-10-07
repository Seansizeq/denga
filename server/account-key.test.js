import { describe, expect, it } from 'vitest';
import { ACCOUNT_KEY_MAX, createAccountKey } from './account-key.js';

/** Той самий маркер, яким рахунок їде в примітці доходу чи витрати. */
const ACCOUNT_NOTE_RE = /\bAccount:\s*([a-z0-9_]{1,48})\b/i;

describe('createAccountKey', () => {
  it('однакова назва дає різні ключі — звільнений ключ не дістається новому рахунку', () => {
    const keys = new Set(Array.from({ length: 50 }, () => createAccountKey('123456789', 'Картка')));
    expect(keys.size).toBe(50);
  });

  it('кирилична назва не лишає ключ порожнім', () => {
    expect(createAccountKey('42', 'Готівка', { suffix: () => 'abc123' })).toBe('42_account_abc123');
  });

  it('латинська назва лишається впізнаваною', () => {
    expect(createAccountKey('42', 'Revolut EUR', { suffix: () => 'abc123' })).toBe('42_revolut_eur_abc123');
  });

  it('довга назва не виводить ключ за межу, яку розпізнає маркер у примітці', () => {
    const key = createAccountKey('1234567890123', 'Revolut Business EUR savings account 2024 extra');
    expect(key.length).toBeLessThanOrEqual(ACCOUNT_KEY_MAX);
    expect(ACCOUNT_NOTE_RE.exec(`Кава Account: ${key}`)?.[1]).toBe(key);
  });

  it('складається лише з символів, які маркер приймає', () => {
    expect(createAccountKey('dev-user', 'My  Card!!', { suffix: () => 'ABC123' })).toBe('devuser_my_card_abc123');
  });
});
