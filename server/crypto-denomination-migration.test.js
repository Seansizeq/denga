import { describe, expect, it } from 'vitest';
import { planCryptoDenominationMigration } from './crypto-denomination-migration.js';

const row = (over = {}) => ({
  accountKey: 'u1_binance',
  section: 'crypto',
  primaryAmount: 2400,
  primaryCurrency: 'PLN',
  subText: '120 USDT',
  ...over,
});

describe('planCryptoDenominationMigration', () => {
  it('turns the free-text position into the balance', () => {
    expect(planCryptoDenominationMigration([row()])).toEqual([
      {
        accountKey: 'u1_binance',
        primaryAmount: 120,
        primaryCurrency: 'USDT',
        subText: null,
        previousAmount: 2400,
        previousCurrency: 'PLN',
      },
    ]);
  });

  it('keeps the note that surrounds the position', () => {
    const [update] = planCryptoDenominationMigration([
      row({ subText: 'на біржі 0,45 ETH холд' }),
    ]);
    expect(update.primaryAmount).toBe(0.45);
    expect(update.primaryCurrency).toBe('ETH');
    expect(update.subText).toBe('на біржі холд');
  });

  it('handles thousands separators and decimal commas', () => {
    const [update] = planCryptoDenominationMigration([
      row({ subText: '1 200,5 SOL' }),
    ]);
    expect(update.primaryAmount).toBe(1200.5);
    expect(update.primaryCurrency).toBe('SOL');
  });

  it('is idempotent once an account is already asset-denominated', () => {
    const migrated = row({ primaryAmount: 120, primaryCurrency: 'USDT', subText: null });
    expect(planCryptoDenominationMigration([migrated])).toEqual([]);
  });

  it('does not re-migrate on a second pass', () => {
    const first = planCryptoDenominationMigration([row()]);
    const after = row({
      primaryAmount: first[0].primaryAmount,
      primaryCurrency: first[0].primaryCurrency,
      subText: first[0].subText,
    });
    expect(planCryptoDenominationMigration([after])).toEqual([]);
  });

  it('leaves a crypto-section account with no parsable position untouched', () => {
    expect(planCryptoDenominationMigration([row({ subText: 'гроші на біржі' })])).toEqual([]);
    expect(planCryptoDenominationMigration([row({ subText: null })])).toEqual([]);
  });

  it('ignores a fiat amount in sub_text that is not a supported asset', () => {
    expect(planCryptoDenominationMigration([row({ subText: '500 PLN' })])).toEqual([]);
  });

  it('ignores non-crypto sections entirely', () => {
    const rows = [
      row({ section: 'bank', subText: '120 USDT' }),
      row({ section: 'debt', subText: '1 BTC' }),
    ];
    expect(planCryptoDenominationMigration(rows)).toEqual([]);
  });

  it('tolerates junk input', () => {
    expect(planCryptoDenominationMigration(null)).toEqual([]);
    expect(planCryptoDenominationMigration([null, undefined, {}])).toEqual([]);
  });
});
