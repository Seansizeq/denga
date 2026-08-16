import { describe, expect, it } from 'vitest';
import {
  calculateResultChange,
  getResultCardTemplates,
  getResultCardTemplateUrl,
  selectResultCardGroup,
  stableResultCardIndex,
} from './resultCard';

describe('result card templates', () => {
  it('exposes every imported template exactly once in its result group', () => {
    expect(getResultCardTemplates('great')).toHaveLength(5);
    expect(getResultCardTemplates('normal')).toHaveLength(4);
    expect(getResultCardTemplates('bad')).toHaveLength(4);
    expect(getResultCardTemplates('very-bad')).toHaveLength(3);
    expect(getResultCardTemplates('week-bad')).toHaveLength(7);

    const all = (['great', 'normal', 'bad', 'very-bad', 'week-bad'] as const)
      .flatMap((group) => getResultCardTemplates(group));
    expect(new Set(all).size).toBe(23);
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

  it('keeps deterministic selection inside a group and builds a public URL', () => {
    const index = stableResultCardIndex('great', 'August 2026');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(5);
    expect(getResultCardTemplateUrl('great', index)).toMatch(/\/result-cards\/great\/great-.+\.png$/);
  });
});
