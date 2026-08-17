import { afterEach, describe, expect, it } from 'vitest';
import { formatCurrency, formatDeltaCurrency, formatSignedCurrency } from './formatters';
import { MONEY_MASK, setMoneyHiddenFlag } from './moneyPrivacy';

afterEach(() => setMoneyHiddenFlag(false));

describe('formatCurrency', () => {
  it('знак не малює — це задумано, `amountBody` бере Math.abs', () => {
    // Через це витрата з цілі виглядала точно як заробіток: там, де важливий
    // напрямок руху, треба formatDeltaCurrency або formatSignedCurrency.
    expect(formatCurrency(-161.18, 'uk-UA', 'USD')).toBe(formatCurrency(161.18, 'uk-UA', 'USD'));
  });
});

describe('formatDeltaCurrency', () => {
  it('плюс для надходження, мінус для витрати', () => {
    expect(formatDeltaCurrency(450, 'uk-UA', 'USD')).toMatch(/^\+\$450$/);
    expect(formatDeltaCurrency(-161.18, 'uk-UA', 'USD')).toMatch(/^−\$161,18$/);
  });

  it('нуль лишається без знака', () => {
    expect(formatDeltaCurrency(0, 'uk-UA', 'USD')).toBe('$0');
  });

  it('тримає символ валюти для кожної з підтримуваних', () => {
    expect(formatDeltaCurrency(-100, 'uk-UA', 'PLN')).toBe('−100 zł');
    expect(formatDeltaCurrency(-100, 'uk-UA', 'UAH')).toBe('−100 ₴');
  });

  it('у приватному режимі ховає і число, і знак', () => {
    // Інакше «−••••» саме́ й видало б, що рух був у мінус.
    setMoneyHiddenFlag(true);
    const hidden = formatDeltaCurrency(-161.18, 'uk-UA', 'USD');
    expect(hidden).toContain(MONEY_MASK);
    expect(hidden).not.toContain('−');
    expect(hidden).not.toContain('+');
  });
});

describe('formatSignedCurrency', () => {
  it('малює мінус для від\'ємного балансу', () => {
    expect(formatSignedCurrency(-161.18, 'uk-UA', 'USD')).toBe('-$161,18');
  });

  it('плюса для додатного не додає — це залишок, а не рух', () => {
    expect(formatSignedCurrency(161.18, 'uk-UA', 'USD')).toBe('$161,18');
  });

  it('у приватному режимі ховає знак', () => {
    setMoneyHiddenFlag(true);
    expect(formatSignedCurrency(-161.18, 'uk-UA', 'USD')).not.toContain('-');
  });
});
