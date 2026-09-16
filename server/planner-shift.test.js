import { describe, expect, it } from 'vitest';
import {
  MAX_SHIFT_HOURS,
  buildShiftNote,
  clampWorkedHours,
  normalizeShiftInput,
  normalizeTimeOfDay,
  shiftInstants,
  summarizeDayEntries,
  workedHoursFromRange,
} from './planner-shift.js';

describe('normalizeTimeOfDay', () => {
  it('приймає час доби й нічого більше', () => {
    expect(normalizeTimeOfDay('09:30')).toBe('09:30');
    expect(normalizeTimeOfDay('00:00')).toBe('00:00');
    expect(normalizeTimeOfDay('23:59')).toBe('23:59');
  });

  it('«майже час» не стає часом', () => {
    for (const value of ['24:00', '9:30', '09:60', '830', '', null, '09:30:00']) {
      expect(normalizeTimeOfDay(value)).toBe('');
    }
  });
});

describe('workedHoursFromRange', () => {
  it('рахує звичайну зміну з точністю до хвилини', () => {
    expect(workedHoursFromRange('09:00', '17:30')).toBe(8.5);
    expect(workedHoursFromRange('09:15', '09:45')).toBe(0.5);
  });

  it('кінець раніше за початок — це нічна зміна, а не помилка', () => {
    expect(workedHoursFromRange('22:00', '06:00')).toBe(8);
    expect(workedHoursFromRange('23:30', '07:15')).toBe(7.75);
  });

  it('однаковий час — незаповнене поле, а не доба роботи', () => {
    // Стара форма в цьому місці мовчки записувала 24 години.
    expect(workedHoursFromRange('09:00', '09:00')).toBeNull();
  });

  it('без часу немає й тривалості', () => {
    expect(workedHoursFromRange('', '17:00')).toBeNull();
    expect(workedHoursFromRange('09:00', 'хтозна')).toBeNull();
  });
});

describe('clampWorkedHours', () => {
  it('ріже все, що більше за добу', () => {
    // «8:30», набране як «830» на цифровій клавіатурі, давало 830 годин.
    expect(clampWorkedHours(830)).toBe(MAX_SHIFT_HOURS);
    expect(clampWorkedHours(8.5)).toBe(8.5);
  });

  it('відʼємне й сміття — це нуль', () => {
    expect(clampWorkedHours(-3)).toBe(0);
    expect(clampWorkedHours('abc')).toBe(0);
    expect(clampWorkedHours(null)).toBe(0);
  });
});

describe('normalizeShiftInput', () => {
  it('рахує години з часу, коли зміну задано проміжком', () => {
    const result = normalizeShiftInput({ body: { mode: 'range', startTime: '22:00', endTime: '06:00' } });
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({ mode: 'range', startTime: '22:00', endTime: '06:00', workedHours: 8 });
  });

  it('проміжок без часу — відмова, а не тиха вісімка', () => {
    const result = normalizeShiftInput({ body: { mode: 'range', startTime: '', endTime: '' } });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_TIME_RANGE' });
  });

  it('у режимі годин час не вигадується', () => {
    const result = normalizeShiftInput({ body: { mode: 'hours', workedHours: 6.25, startTime: '09:00' } });
    expect(result.value).toMatchObject({ mode: 'hours', startTime: '', endTime: '', workedHours: 6.25 });
  });

  it('нуль годин у режимі годин — відмова', () => {
    expect(normalizeShiftInput({ body: { mode: 'hours', workedHours: 0 } })).toMatchObject({
      ok: false,
      code: 'INVALID_HOURS',
    });
  });

  it('сума рахується зі ставки, коли її не назвали', () => {
    const result = normalizeShiftInput({
      body: { mode: 'range', startTime: '09:00', endTime: '17:00', salaryRate: 100 },
    });
    expect(result.value.salaryAmount).toBe(800);
  });

  it('названа сума важить більше за ставку', () => {
    const result = normalizeShiftInput({
      body: { mode: 'range', startTime: '09:00', endTime: '17:00', salaryRate: 100, salaryAmount: 950 },
    });
    expect(result.value.salaryAmount).toBe(950);
  });

  it('шаблон приносить свій час, а не «зараз»', () => {
    // Раніше «Нічна 22:00–06:00», застосована до дня, лягала як поточний час.
    const result = normalizeShiftInput({
      body: {},
      template: { isFullDay: false, startTime: '22:00', endTime: '06:00', salaryRate: 50, note: 'Нічна' },
    });
    expect(result.value).toMatchObject({ mode: 'range', startTime: '22:00', endTime: '06:00', workedHours: 8 });
    expect(result.value.salaryAmount).toBe(400);
  });

  it('шаблон «на весь день» дає години без часу', () => {
    const result = normalizeShiftInput({
      body: {},
      template: { isFullDay: true, workedHours: 8, startTime: '09:00', endTime: '17:00' },
    });
    expect(result.value).toMatchObject({ mode: 'hours', workedHours: 8, startTime: '' });
  });

  it('при редагуванні незаймані поля лишаються як були', () => {
    const current = {
      mode: 'range',
      startTime: '09:00',
      endTime: '17:00',
      workedHours: 8,
      salaryRate: 0,
      salaryAmount: 700,
      salaryCurrency: 'PLN',
      note: 'Денна',
    };
    const result = normalizeShiftInput({ body: { endTime: '19:00' }, current });
    expect(result.value).toMatchObject({
      startTime: '09:00',
      endTime: '19:00',
      workedHours: 10,
      salaryCurrency: 'PLN',
      note: 'Денна',
    });
  });

  it('назва й символ складаються в підпис зміни', () => {
    const result = normalizeShiftInput({
      body: { mode: 'hours', workedHours: 8, name: 'Склад', symbol: '🌙' },
    });
    expect(result.value.note).toBe('Склад • 🌙');
  });
});

describe('shiftInstants', () => {
  // Спрощений пояс без переходу на літній час: тест перевіряє склейку, а не
  // Intl.
  const toUtcMs = (day, hours, minutes) => Date.parse(`${day}T00:00:00.000Z`) + (hours * 60 + minutes) * 60_000;

  it('початок і кінець стають справжніми мітками часу', () => {
    const result = shiftInstants({
      day: '2026-09-16',
      mode: 'range',
      startTime: '09:00',
      endTime: '17:30',
      toUtcMs,
    });
    expect(result.startedAt).toBe('2026-09-16T09:00:00.000Z');
    expect(result.endedAt).toBe('2026-09-16T17:30:00.000Z');
  });

  it('нічна зміна закінчується наступного дня', () => {
    // Інакше кінець виявився б раніше за початок, і стрічка змін поставила б
    // її перед власним початком.
    const result = shiftInstants({
      day: '2026-09-16',
      mode: 'range',
      startTime: '22:00',
      endTime: '06:00',
      toUtcMs,
    });
    expect(result.startedAt).toBe('2026-09-16T22:00:00.000Z');
    expect(result.endedAt).toBe('2026-09-17T06:00:00.000Z');
  });

  it('без проміжку обидві мітки — середина дня, щоб порядок був стабільним', () => {
    const result = shiftInstants({ day: '2026-09-16', mode: 'hours', toUtcMs });
    expect(result.startedAt).toBe('2026-09-16T12:00:00.000Z');
    expect(result.endedAt).toBe('2026-09-16T12:00:00.000Z');
  });
});

describe('summarizeDayEntries', () => {
  it('складає години й суми окремо за валютами', () => {
    const summary = summarizeDayEntries([
      { workedHours: 4, salaryAmount: 400, salaryCurrency: 'UAH', endedAt: '2026-09-16T12:00:00.000Z', note: 'Ранок' },
      { workedHours: 3.5, salaryAmount: 100, salaryCurrency: 'PLN', endedAt: '2026-09-16T20:00:00.000Z', note: 'Вечір' },
    ]);
    expect(summary).toMatchObject({
      count: 2,
      workedHours: 7.5,
      salaryAmountUah: 400,
      salaryAmountPln: 100,
      latestNote: 'Вечір',
    });
  });

  it('порожній день — нулі, а не падіння', () => {
    expect(summarizeDayEntries([])).toMatchObject({ count: 0, workedHours: 0, latestNote: '' });
  });
});

describe('buildShiftNote', () => {
  it('складає лише те, що є', () => {
    expect(buildShiftNote('Склад', '')).toBe('Склад');
    expect(buildShiftNote('', '🌙')).toBe('🌙');
    expect(buildShiftNote('', '')).toBe('');
  });
});
