import { describe, expect, it } from 'vitest';
import { PAIR_WINDOW_MS, findTransferPair, isTransferLike } from './own-transfer.js';

const T0 = Date.parse('2026-10-10T10:00:00.000Z');
const out = (over = {}) => ({
  id: 'out',
  type: 'expense',
  amountUsd: 24,
  accountKey: 'privat',
  createdAtMs: T0,
  transferHint: true,
  ...over,
});
const inc = (over = {}) => ({
  id: 'in',
  type: 'income',
  amountUsd: 24,
  accountKey: 'pumb',
  createdAtMs: T0 + 60_000,
  transferHint: false,
  ...over,
});

describe('isTransferLike', () => {
  it('впізнає переказ за словами й назвами банків', () => {
    expect(isTransferLike({ bankCategory: 'Перекази', merchant: 'На картку' })).toBe(true);
    expect(isTransferLike({ merchant: 'P2P transfer' })).toBe(true);
    expect(isTransferLike({ merchant: 'Przelew na konto' })).toBe(true);
    expect(isTransferLike({ merchant: 'BYBIT CARD TOP UP' })).toBe(true);
    expect(isTransferLike({ merchant: 'ПУМБ' })).toBe(true);
  });

  it('впізнає переказ за кодом банку, коли опис — лише імʼя одержувача', () => {
    expect(isTransferLike({ merchant: 'Богдан С.', mcc: 4829 })).toBe(true);
    expect(isTransferLike({ merchant: 'Богдан С.', mcc: '6538' })).toBe(true);
    expect(isTransferLike({ merchant: 'Богдан С.', mcc: 5411 })).toBe(false);
    expect(isTransferLike({ merchant: 'Богдан С.' })).toBe(false);
  });

  it('«MONODirect» у зарахуванні ПУМБ — переказ із monobank', () => {
    expect(isTransferLike({ merchant: 'MONODirect' })).toBe(true);
    expect(isTransferLike({ merchant: 'Monobank' })).toBe(true);
    // А «Monolith Cafe» — ні.
    expect(isTransferLike({ merchant: 'Monolith Cafe' })).toBe(false);
  });

  it('звичайна покупка переказом не є', () => {
    expect(isTransferLike({ bankCategory: 'Продукти', merchant: 'JMP S.A. BIEDRONKA' })).toBe(false);
    expect(isTransferLike({ merchant: 'PRIVATE CLINIC' })).toBe(false);
    expect(isTransferLike({ merchant: 'Приватна аптека' })).toBe(false);
  });
});

describe('findTransferPair', () => {
  it('зводить списання й зарахування з однаковою сумою за кілька хвилин', () => {
    expect(findTransferPair(inc(), [out()])?.id).toBe('out');
    expect(findTransferPair(out(), [inc()])?.id).toBe('in');
  });

  it('пропускає комісію й різницю курсів у межах 3 %', () => {
    expect(findTransferPair(inc({ amountUsd: 23.4 }), [out()])?.id).toBe('out');
    expect(findTransferPair(inc({ amountUsd: 22 }), [out()])).toBeNull();
  });

  it('звичайна покупка не зводиться з випадковим зарахуванням тієї ж суми', () => {
    expect(findTransferPair(inc(), [out({ transferHint: false })])).toBeNull();
  });

  it('досить, щоб переказом виглядав бік зарахування', () => {
    // monobank у списанні пише лише імʼя одержувача, ПУМБ у зарахуванні — «MONODirect».
    expect(findTransferPair(inc({ transferHint: true }), [out({ transferHint: false })])?.id).toBe('out');
    expect(findTransferPair(out({ transferHint: false }), [inc({ transferHint: true })])?.id).toBe('in');
  });

  it('не зводить через 20 хвилин', () => {
    expect(findTransferPair(inc({ createdAtMs: T0 + PAIR_WINDOW_MS + 1000 }), [out()])).toBeNull();
  });

  it('без рахунку з будь-якого боку зводити нема між чим', () => {
    expect(findTransferPair(inc({ accountKey: null }), [out()])).toBeNull();
    expect(findTransferPair(inc(), [out({ accountKey: null })])).toBeNull();
  });

  it('не бере вже зведене й того самого напрямку', () => {
    expect(findTransferPair(inc(), [out({ pairedWith: 'x' })])).toBeNull();
    expect(findTransferPair(inc(), [inc({ id: 'in2' })])).toBeNull();
  });

  it('з кількох кандидатів бере найближчу суму, потім найближчий час', () => {
    const candidates = [
      out({ id: 'far-amount', amountUsd: 24.6 }),
      out({ id: 'exact-late', amountUsd: 24, createdAtMs: T0 - 10 * 60_000 }),
      out({ id: 'exact-near', amountUsd: 24, createdAtMs: T0 + 30_000 }),
    ];
    expect(findTransferPair(inc(), candidates)?.id).toBe('exact-near');
  });
});
