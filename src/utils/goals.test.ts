import { describe, expect, it } from 'vitest';
import {
  computeGoalPace,
  deadlineDeltaDays,
  fillColorForPct,
  progressPct,
  rawProgressPct,
  sumPeriodEarnings,
} from './goals';

const NOW = new Date(2026, 7, 17, 12, 0, 0); // 17 серпня 2026, локальний полудень

describe('progressPct', () => {
  it('обрізає перевищення сотнею — смужка не буває довшою за себе', () => {
    expect(progressPct(150, 100)).toBe(100);
  });

  it('віддає нуль на нульовій або від\'ємній цілі, а не NaN/Infinity', () => {
    expect(progressPct(50, 0)).toBe(0);
    expect(progressPct(50, -10)).toBe(0);
  });
});

describe('rawProgressPct', () => {
  it('лишає перевищення видимим', () => {
    expect(rawProgressPct(150, 100)).toBe(150);
  });
});

describe('fillColorForPct', () => {
  it('веде колір від власного кольору цілі через зелений до жовтого', () => {
    expect(fillColorForPct(10, '#123456')).toBe('#123456');
    expect(fillColorForPct(50, '#123456')).toBe('var(--accent-green)');
    expect(fillColorForPct(100, '#123456')).toBe('var(--accent-yellow)');
  });

  it('падає на токен акценту, якщо кольору цілі немає', () => {
    expect(fillColorForPct(10, '')).toBe('var(--accent-primary)');
  });
});

describe('deadlineDeltaDays', () => {
  it('рахує різницю в днях у локальному часі', () => {
    expect(deadlineDeltaDays('2026-08-20', NOW)).toBe(3);
    expect(deadlineDeltaDays('2026-08-17', NOW)).toBe(0);
    expect(deadlineDeltaDays('2026-08-10', NOW)).toBe(-7);
  });

  it('віддає null на порожньому чи кривому форматі', () => {
    expect(deadlineDeltaDays(null, NOW)).toBeNull();
    expect(deadlineDeltaDays('20.08.2026', NOW)).toBeNull();
  });
});

describe('computeGoalPace — фази', () => {
  const base = {
    target: 1000,
    createdAt: '2026-08-07T10:00:00.000Z',
    contributions: [{ date: '2026-08-10', amount: 500 }],
    now: NOW,
  };

  it('running, поки ціль не взята і дедлайн не минув', () => {
    const pace = computeGoalPace({ ...base, saved: 500, deadline: '2026-08-27' });
    expect(pace.phase).toBe('running');
    expect(pace.remaining).toBe(500);
    expect(pace.reachedInDays).toBeNull();
  });

  it('done, коли ціль узята, навіть якщо дедлайн уже минув', () => {
    const pace = computeGoalPace({
      ...base,
      saved: 1000,
      deadline: '2026-08-10',
      contributions: [
        { date: '2026-08-09', amount: 500 },
        { date: '2026-08-10', amount: 500 },
      ],
    });
    expect(pace.phase).toBe('done');
    expect(pace.remaining).toBe(0);
    // Ціль створено 7-го, планку перетнув внесок 10-го — три дні.
    expect(pace.reachedInDays).toBe(3);
  });

  it('не вигадує день досягнення, коли внески не сходяться з сумою цілі', () => {
    // `saved` приходить із сервера зі збереженою конверсією, а список внесків —
    // окремим запитом. Якщо вони розійшлися, краще не показати число, ніж збрехати.
    const pace = computeGoalPace({ ...base, saved: 1000, deadline: '2026-08-27' });
    expect(pace.phase).toBe('done');
    expect(pace.reachedInDays).toBeNull();
  });

  it('expired, коли дедлайн минув, а ціль не взята', () => {
    const pace = computeGoalPace({ ...base, saved: 500, deadline: '2026-08-10' });
    expect(pace.phase).toBe('expired');
    expect(pace.daysLeft).toBe(0);
  });

  it('показує перевищення цілі', () => {
    const pace = computeGoalPace({ ...base, saved: 1200, deadline: '2026-08-27' });
    expect(pace.overachieved).toBe(200);
  });
});

describe('computeGoalPace — денна норма і темп', () => {
  it('без дедлайну денна норма дорівнює залишку — тому UI її й не показує', () => {
    // Ділити залишок ні на що, тож `neededPerDay` вироджується в сам залишок.
    // Плитка в такому разі показує фактичний темп, інакше дублювала б сусідню.
    const pace = computeGoalPace({
      saved: 16000,
      target: 60000,
      createdAt: '2026-08-05T09:00:00.000Z',
      deadline: null,
      contributions: [{ date: '2026-08-05', amount: 16000 }],
      now: NOW,
    });
    expect(pace.daysLeft).toBeNull();
    expect(pace.neededPerDay).toBe(pace.remaining);
  });

  it('денна норма — залишок, розкиданий на дні, що лишилися', () => {
    const pace = computeGoalPace({
      saved: 500,
      target: 1000,
      createdAt: '2026-08-07T10:00:00.000Z',
      deadline: '2026-08-27',
      contributions: [{ date: '2026-08-10', amount: 500 }],
      now: NOW,
    });
    expect(pace.neededPerDay).toBeCloseTo(50, 5);
  });

  it('стартова сума не входить у фактичний темп — її не заробляли за ці дні', () => {
    const pace = computeGoalPace({
      saved: 900,
      target: 1000,
      baseline: 700,
      createdAt: '2026-08-07T10:00:00.000Z',
      deadline: '2026-08-27',
      contributions: [{ date: '2026-08-10', amount: 200 }],
      now: NOW,
    });
    // Заробили 200 за 20 днів забігу, а не 900.
    expect(pace.actualPerDay).toBeCloseTo(10, 5);
  });

  it('веде відлік від першого внеску, якщо той старіший за саму ціль', () => {
    // Гроші відкладали з 5-го, а ціль на них завели лише сьогодні, вписавши
    // внески заднім числом. Якщо міряти від дати створення, вікно стискається
    // до одного дня, і темп виходить так, ніби все зібрано за сьогодні.
    const pace = computeGoalPace({
      saved: 16000,
      target: 60000,
      createdAt: '2026-08-17T09:00:00.000Z',
      deadline: null,
      contributions: [
        { date: '2026-08-05', amount: 4000 },
        { date: '2026-08-09', amount: 4000 },
        { date: '2026-08-13', amount: 4000 },
        { date: '2026-08-16', amount: 4000 },
      ],
      now: NOW,
    });
    // 12 днів від 5 до 17 серпня, 16000 зібрано → приблизно 1333/день.
    expect(pace.actualPerDay).toBeCloseTo(16000 / 12, 5);
    // І прогноз рахується з того самого вікна: 44000 / 1333 ≈ 33 дні.
    expect(pace.forecastDate).toBe('2026-09-19');
  });

  it('не ділить на нуль, коли дедлайн — день створення цілі', () => {
    const pace = computeGoalPace({
      saved: 100,
      target: 1000,
      createdAt: '2026-08-17T10:00:00.000Z',
      deadline: '2026-08-17',
      contributions: [{ date: '2026-08-17', amount: 100 }],
      now: NOW,
    });
    expect(Number.isFinite(pace.neededPerDay)).toBe(true);
    expect(Number.isFinite(pace.actualPerDay)).toBe(true);
    expect(pace.totalDays).toBe(1);
  });
});

describe('computeGoalPace — прогноз', () => {
  it('проєктує дату закриття з набраного темпу', () => {
    // Створено 7-го, минуло 10 днів, зібрано 500 → 50/день, лишилось 500 → +10 днів.
    const pace = computeGoalPace({
      saved: 500,
      target: 1000,
      createdAt: '2026-08-07T10:00:00.000Z',
      deadline: '2026-09-30',
      contributions: [{ date: '2026-08-10', amount: 500 }],
      now: NOW,
    });
    expect(pace.forecastDate).toBe('2026-08-27');
  });

  it('без внесків прогнозу немає — темпу ще не існує', () => {
    const pace = computeGoalPace({
      saved: 0,
      target: 1000,
      createdAt: '2026-08-07T10:00:00.000Z',
      deadline: '2026-09-30',
      contributions: [],
      now: NOW,
    });
    expect(pace.forecastDate).toBeNull();
  });

  it('на взятій цілі прогнозу немає — прогнозувати нічого', () => {
    const pace = computeGoalPace({
      saved: 1000,
      target: 1000,
      createdAt: '2026-08-07T10:00:00.000Z',
      deadline: '2026-09-30',
      contributions: [{ date: '2026-08-10', amount: 1000 }],
      now: NOW,
    });
    expect(pace.forecastDate).toBeNull();
  });

  it('мовчить, коли темп такий, що прогноз іде за горизонт десяти років', () => {
    const pace = computeGoalPace({
      saved: 1,
      target: 1000000,
      createdAt: '2026-08-07T10:00:00.000Z',
      deadline: '2026-09-30',
      contributions: [{ date: '2026-08-10', amount: 1 }],
      now: NOW,
    });
    expect(pace.forecastDate).toBeNull();
  });

  it('віддає прогноз і для цілі без дедлайну', () => {
    const pace = computeGoalPace({
      saved: 500,
      target: 1000,
      createdAt: '2026-08-07T10:00:00.000Z',
      deadline: null,
      contributions: [{ date: '2026-08-10', amount: 500 }],
      now: NOW,
    });
    expect(pace.forecastDate).toBe('2026-08-27');
  });
});

describe('computeGoalPace — конвертовані внески', () => {
  it('бере convertedAmount, коли він є: внесок міг бути в іншій валюті', () => {
    const pace = computeGoalPace({
      saved: 1000,
      target: 1000,
      createdAt: '2026-08-07T10:00:00.000Z',
      deadline: '2026-08-27',
      contributions: [
        { date: '2026-08-09', amount: 20, convertedAmount: 800 },
        { date: '2026-08-11', amount: 5, convertedAmount: 200 },
      ],
      now: NOW,
    });
    // Планку перетинає другий внесок (11-го), а не перший.
    expect(pace.reachedInDays).toBe(4);
  });
});

describe('sumPeriodEarnings', () => {
  it('розкладає внески по сьогодні / вчора / місяцю / попередньому місяцю', () => {
    const totals = sumPeriodEarnings(
      [
        { date: '2026-08-17', amount: 100 },
        { date: '2026-08-16', amount: 50 },
        { date: '2026-08-01', amount: 25 },
        { date: '2026-07-30', amount: 400 },
        { date: '2026-06-15', amount: 999 },
      ],
      NOW
    );
    expect(totals.today).toBe(100);
    expect(totals.yesterday).toBe(50);
    expect(totals.month).toBe(175);
    expect(totals.prevMonth).toBe(400);
  });

  it('використовує конвертовану суму, коли валюта внеску інша', () => {
    const totals = sumPeriodEarnings([{ date: '2026-08-17', amount: 20, convertedAmount: 830 }], NOW);
    expect(totals.today).toBe(830);
  });
});
