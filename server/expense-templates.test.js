import { describe, expect, it } from 'vitest';
import { mapTemplateRow, validateTemplatePayload } from './expense-templates.js';

const valid = (over = {}) => ({
  name: 'Кава',
  type: 'expense',
  amount: 65,
  currency: 'UAH',
  categoryId: 'food',
  ...over,
});

describe('validateTemplatePayload', () => {
  it('accepts a complete template', () => {
    expect(validateTemplatePayload(valid())).toMatchObject({
      ok: true,
      name: 'Кава',
      type: 'expense',
      amount: 65,
      currency: 'UAH',
      categoryId: 'food',
      note: null,
      account: null,
    });
  });

  it('keeps a template without an amount — it prefills the rest', () => {
    expect(validateTemplatePayload(valid({ amount: undefined }))).toMatchObject({ ok: true, amount: null });
    expect(validateTemplatePayload(valid({ amount: null }))).toMatchObject({ ok: true, amount: null });
    expect(validateTemplatePayload(valid({ amount: '' }))).toMatchObject({ ok: true, amount: null });
  });

  it('rejects a non-positive amount when one is given', () => {
    expect(validateTemplatePayload(valid({ amount: 0 }))).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    expect(validateTemplatePayload(valid({ amount: -5 }))).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    expect(validateTemplatePayload(valid({ amount: 'abc' }))).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
  });

  it('requires a name and collapses stray whitespace', () => {
    expect(validateTemplatePayload(valid({ name: '   ' }))).toMatchObject({ ok: false, code: 'INVALID_NAME' });
    expect(validateTemplatePayload(valid({ name: '  Обід   на  роботі ' }))).toMatchObject({
      ok: true,
      name: 'Обід на роботі',
    });
  });

  it('caps the name length', () => {
    expect(validateTemplatePayload(valid({ name: 'x'.repeat(41) }))).toMatchObject({
      ok: false,
      code: 'INVALID_NAME',
    });
  });

  it('refuses a transfer template', () => {
    expect(validateTemplatePayload(valid({ type: 'transfer' }))).toMatchObject({
      ok: false,
      code: 'INVALID_TYPE',
    });
  });

  it('requires a category', () => {
    expect(validateTemplatePayload(valid({ categoryId: '' }))).toMatchObject({
      ok: false,
      code: 'INVALID_CATEGORY',
    });
  });

  it('caps the note length', () => {
    expect(validateTemplatePayload(valid({ note: 'x'.repeat(121) }))).toMatchObject({
      ok: false,
      code: 'INVALID_NOTE',
    });
  });

  it('normalises the account key and keeps crypto denominations', () => {
    expect(validateTemplatePayload(valid({ account: '  Privat24 ' }))).toMatchObject({ account: 'privat24' });
    expect(validateTemplatePayload(valid({ currency: 'USDT' }))).toMatchObject({ currency: 'USDT' });
    expect(validateTemplatePayload(valid({ currency: 'ZZZ' }))).toMatchObject({ currency: 'UAH' });
  });
});

describe('mapTemplateRow', () => {
  it('turns a database row into the client shape', () => {
    expect(
      mapTemplateRow({
        id: 't1',
        name: 'Метро',
        type: 'expense',
        amount: 8,
        currency: 'UAH',
        categoryId: 'transport',
        note: null,
        accountKey: null,
      }),
    ).toEqual({
      id: 't1',
      name: 'Метро',
      type: 'expense',
      amount: 8,
      currency: 'UAH',
      categoryId: 'transport',
      note: undefined,
      account: undefined,
    });
  });

  it('leaves an absent amount absent instead of turning it into zero', () => {
    expect(mapTemplateRow({ id: 't2', name: 'n', type: 'income', amount: null, categoryId: 'salary' }).amount)
      .toBe(undefined);
  });
});
