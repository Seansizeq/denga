import { describe, expect, it } from 'vitest';
import {
  calculateResultChange,
  getResultCardTemplates,
  getResultCardTemplateUrl,
  selectResultCardGroup,
  selectGoalResultCardGroup,
  resultValueColor,
} from './resultCard';

describe('result card templates', () => {
  it('exposes every imported template exactly once in its result group', () => {
    expect(getResultCardTemplates('great')).toHaveLength(13);
    expect(getResultCardTemplates('normal')).toHaveLength(13);
    expect(getResultCardTemplates('bad')).toHaveLength(4);
    expect(getResultCardTemplates('very-bad')).toHaveLength(3);
    expect(getResultCardTemplates('week-bad')).toHaveLength(7);

    const all = (['great', 'normal', 'bad', 'very-bad', 'week-bad'] as const)
      .flatMap((group) => getResultCardTemplates(group));
    expect(new Set(all).size).toBe(40);
  });

  it('uses the weekly negative collection for a losing week', () => {
    expect(selectResultCardGroup('week', -100, 50)).toBe('week-bad');
  });

  it('separates strong, ordinary, bad and very bad results', () => {
    expect(selectResultCardGroup('month', 200, 100)).toBe('great');
    expect(selectResultCardGroup('month', 105, 100)).toBe('normal');
    expect(selectResultCardGroup('month', -110, -100)).toBe('bad');
    expect(selectResultCardGroup('month', -160, -100)).toBe('very-bad');
    expect(selectResultCardGroup('today', 0, 0)).toBe('normal');
  });

  it('treats a smaller loss as an improvement', () => {
    expect(calculateResultChange(-50, -100)).toBe(50);
    expect(calculateResultChange(50, 0)).toBeNull();
  });

  it('colors positive values green and negative values red', () => {
    expect(resultValueColor(1)).toBe('#4cd97b');
    expect(resultValueColor(-1)).toBe('#ff5a63');
    expect(resultValueColor(0)).toBe('#ffffff');
  });

  it('builds a public URL and wraps an out-of-range index', () => {
    expect(getResultCardTemplateUrl('great', 0)).toMatch(/\/result-cards\/great\/great-.+\.png$/);
    // Індекс тепер випадковий, тож URL має витримати будь-яке число.
    expect(getResultCardTemplateUrl('great', 99)).toMatch(/\/result-cards\/great\/great-.+\.png$/);
    expect(getResultCardTemplateUrl('great', -3)).toMatch(/\/result-cards\/great\/great-.+\.png$/);
  });

  it('selects goal templates from progress against the deadline', () => {
    const now = new Date('2026-08-16T12:00:00');
    const base = {
      target: 1000,
      createdAt: '2026-08-01T00:00:00.000Z',
      deadline: '2026-08-31',
      now,
    };

    expect(selectGoalResultCardGroup({ ...base, saved: 900 })).toBe('great');
    expect(selectGoalResultCardGroup({ ...base, saved: 500 })).toBe('normal');
    expect(selectGoalResultCardGroup({ ...base, saved: 300 })).toBe('bad');
    expect(selectGoalResultCardGroup({ ...base, saved: 100 })).toBe('very-bad');
    expect(selectGoalResultCardGroup({ ...base, saved: 1000 })).toBe('great');
  });

  it('uses a very bad template for an overdue unfinished goal', () => {
    expect(selectGoalResultCardGroup({
      saved: 800,
      target: 1000,
      createdAt: '2026-07-01T00:00:00.000Z',
      deadline: '2026-07-31',
      now: new Date('2026-08-16T12:00:00'),
    })).toBe('very-bad');
  });
});
