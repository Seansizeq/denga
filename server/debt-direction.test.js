import { describe, expect, it } from 'vitest';
import {
  legacyDebtPhraseForDirection,
  resolveDebtDirectionForMigration,
} from './debt-direction.js';

describe('debt direction migration', () => {
  it('never overwrites an explicit modern direction with stale legacy text', () => {
    expect(resolveDebtDirectionForMigration({
      debtDirection: 'owed_to_me',
      debtPhrase: 'я винен',
    })).toEqual({ direction: 'owed_to_me', shouldUpdate: false });
  });

  it('infers old rows only when the modern direction is missing', () => {
    expect(resolveDebtDirectionForMigration({
      debtDirection: null,
      debtPhrase: 'Я винен Михайлу',
    })).toEqual({ direction: 'owed_by_me', shouldUpdate: true });
    expect(resolveDebtDirectionForMigration({
      debtDirection: '',
      debtPhrase: 'мені винні',
    })).toEqual({ direction: 'owed_to_me', shouldUpdate: true });
    expect(resolveDebtDirectionForMigration({
      debtDirection: null,
      debtPhrase: 'мне должны',
    })).toEqual({ direction: 'owed_to_me', shouldUpdate: true });
  });

  it('keeps the legacy phrase consistent when a direction is saved', () => {
    expect(legacyDebtPhraseForDirection('owed_to_me')).toBe('мені винні');
    expect(legacyDebtPhraseForDirection('owed_by_me')).toBe('я винен');
  });
});
