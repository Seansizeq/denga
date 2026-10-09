import { describe, expect, it } from 'vitest';
import { fiatAmountsAt, nbuDayRates, nbuRatesUrl, stampedAmount, transactionDay } from './fx-history.js';

const SEPT = { usdUah: 41.2, usdPln: 3.9, crypto: { USDT: 1, SOL: 150 } };

describe('fiatAmountsAt', () => {
  it('рахує суми в трьох валютах за курсами одного дня', () => {
    expect(fiatAmountsAt(100, 'PLN', SEPT)).toEqual({
      amountUah: 1056.41,
      amountPln: 100,
      amountUsd: 25.64,
    });
  });

  it('сума у власній валюті лишається точно такою, як записана', () => {
    expect(fiatAmountsAt(57.67, 'UAH', SEPT).amountUah).toBe(57.67);
    expect(fiatAmountsAt(5.23, 'USD', SEPT).amountUsd).toBe(5.23);
  });

  it('крипта рахується через ціну монети того дня', () => {
    expect(fiatAmountsAt(2, 'SOL', SEPT)).toMatchObject({ amountUsd: 300, amountUah: 12360 });
  });

  it('без ціни монети чи курсу — нічого, а не вигадана цифра', () => {
    expect(fiatAmountsAt(1, 'TON', SEPT)).toBeNull();
    expect(fiatAmountsAt(1, 'UAH', { usdUah: 0, usdPln: 3.9 })).toBeNull();
    expect(fiatAmountsAt(1, 'UAH', null)).toBeNull();
  });
});

describe('stampedAmount', () => {
  it('віддає записану суму у валюті звіту', () => {
    const tx = { amountUah: 1056.41, amountPln: 100, amountUsd: 25.64 };
    expect(stampedAmount(tx, 'pln')).toBe(100);
    expect(stampedAmount(tx, 'USD')).toBe(25.64);
  });

  it('незаповнена сума — сигнал перерахувати, а не нуль', () => {
    expect(stampedAmount({ amountUah: null }, 'UAH')).toBeNull();
    expect(stampedAmount({}, 'UAH')).toBeNull();
    expect(stampedAmount({ amountUah: 5 }, 'EUR')).toBeNull();
  });

  it('нульова записана сума — це сума, а не її відсутність', () => {
    expect(stampedAmount({ amountUah: 0 }, 'UAH')).toBe(0);
  });
});

describe('НБУ', () => {
  it('розбирає гривню за долар і злотий через гривню', () => {
    const payload = [
      { r030: 840, cc: 'USD', rate: 41.2 },
      { r030: 985, cc: 'PLN', rate: 10.56 },
      { r030: 978, cc: 'EUR', rate: 45 },
    ];
    const rates = nbuDayRates(payload);
    expect(rates.usdUah).toBe(41.2);
    expect(rates.usdPln).toBeCloseTo(3.9015, 4);
  });

  it('без потрібних пар — нічого', () => {
    expect(nbuDayRates([{ cc: 'USD', rate: 41 }])).toBeNull();
    expect(nbuDayRates({ error: 'x' })).toBeNull();
  });

  it('дата в адресі — без дефісів, як хоче НБУ', () => {
    expect(nbuRatesUrl('2026-09-15')).toContain('date=20260915&json');
  });
});

describe('transactionDay', () => {
  it('бере дату з мітки операції', () => {
    expect(transactionDay('2026-09-15T12:00:00.000Z')).toBe('2026-09-15');
    expect(transactionDay('сміття')).toBeNull();
  });
});
