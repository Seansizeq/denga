import { describe, expect, it } from 'vitest';
import { planGoalContributionTransferMigration } from './goal-contribution-migration.js';
import { getTransactionAccountEffects, resolveEffectDelta } from './transaction-effects.js';

const asset = () => 'card';
const debt = () => 'debt';

describe('planGoalContributionTransferMigration', () => {
  it('бере ключ рахунку з note-маркера, коли колонки немає', () => {
    const { updates } = planGoalContributionTransferMigration(
      [{ id: 't1', type: 'expense', categoryId: 'other_expense', note: 'Ціль: Авто Account: mono', fromAccountKey: null }],
      asset
    );
    expect(updates).toEqual([
      { id: 't1', fromAccountKey: 'mono', previousType: 'expense', previousCategoryId: 'other_expense' },
    ]);
  });

  it('віддає перевагу колонці fromAccountKey над маркером', () => {
    const { updates } = planGoalContributionTransferMigration(
      [{ id: 't1', type: 'expense', note: 'Account: mono', fromAccountKey: 'Cash' }],
      asset
    );
    expect(updates[0].fromAccountKey).toBe('cash');
  });

  it('idempotent: те, що вже переказ, не чіпає', () => {
    const { updates, skipped } = planGoalContributionTransferMigration(
      [{ id: 't1', type: 'transfer', note: 'Account: mono', fromAccountKey: 'mono' }],
      asset
    );
    expect(updates).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it('лишає витратою запис без розпізнаного рахунку', () => {
    // Без джерела переказ втратив би списання — баланс поїхав би.
    const { updates, skipped } = planGoalContributionTransferMigration(
      [{ id: 't1', type: 'expense', note: 'Ціль: Авто', fromAccountKey: null }],
      asset
    );
    expect(updates).toEqual([]);
    expect(skipped).toEqual([{ id: 't1', reason: 'NO_ACCOUNT' }]);
  });

  it('лишає витратою запис із пасиву — інакше apply і rollback розійдуться в знаку', () => {
    const { updates, skipped } = planGoalContributionTransferMigration(
      [{ id: 't1', type: 'expense', note: 'Account: visa', fromAccountKey: 'visa' }],
      debt
    );
    expect(updates).toEqual([]);
    expect(skipped).toEqual([{ id: 't1', reason: 'DEBT_SOURCE' }]);
  });

  it('розводить кілька рядків по своїх кошиках', () => {
    const { updates, skipped } = planGoalContributionTransferMigration(
      [
        { id: 'ok', type: 'expense', note: 'Account: mono', fromAccountKey: null },
        { id: 'none', type: 'expense', note: 'Ціль: Авто', fromAccountKey: null },
        { id: 'done', type: 'transfer', note: 'Account: mono', fromAccountKey: 'mono' },
      ],
      asset
    );
    expect(updates.map((u) => u.id)).toEqual(['ok']);
    expect(skipped).toEqual([{ id: 'none', reason: 'NO_ACCOUNT' }]);
  });

  it('не падає на порожньому вводі', () => {
    expect(planGoalContributionTransferMigration(null)).toEqual({ updates: [], skipped: [] });
    expect(planGoalContributionTransferMigration([{ id: '  ' }], asset)).toEqual({ updates: [], skipped: [] });
  });
});

/**
 * Головна властивість безпеки міграції: вона не переграє ефекти транзакцій, тож
 * списання з рахунку до і після зміни типу мусить бути тим самим числом. Якби
 * воно розійшлося, кожен наявний внесок зсунув би баланс.
 */
describe('міграція не рухає балансів', () => {
  const AMOUNT = 250;

  const before = {
    amount: AMOUNT,
    currency: 'UAH',
    type: 'expense',
    categoryId: 'other_expense',
    note: 'Ціль: Авто Account: mono',
  };

  const after = {
    amount: AMOUNT,
    currency: 'UAH',
    type: 'transfer',
    categoryId: 'transfer',
    note: 'Ціль: Авто Account: mono',
    fromAccountKey: 'mono',
    toAccountKey: null,
  };

  it('дає однакову delta для звичайного рахунку до і після', () => {
    const [effectBefore] = getTransactionAccountEffects(before);
    const [effectAfter] = getTransactionAccountEffects(after);
    expect(effectBefore).toEqual({ accountKey: 'mono', delta: -AMOUNT, currency: 'UAH' });
    expect(effectAfter).toEqual({ accountKey: 'mono', delta: -AMOUNT, currency: 'UAH' });
  });

  it('переказ без рахунку-приймача списує тільки джерело', () => {
    expect(getTransactionAccountEffects(after)).toHaveLength(1);
  });

  it('відкат переказу повертає гроші на рахунок', () => {
    const [effect] = getTransactionAccountEffects(after);
    const account = { section: 'bank', primaryCurrency: 'UAH' };
    expect(resolveEffectDelta(after, effect, 1, account)).toBe(-AMOUNT);
    expect(resolveEffectDelta(after, effect, -1, account)).toBe(AMOUNT);
  });

  it('саме через це пасив і не мігрує: знак для нього розходиться', () => {
    const [effectBefore] = getTransactionAccountEffects(before);
    const [effectAfter] = getTransactionAccountEffects(after);
    const liability = { section: 'debt', debtDirection: 'owed_by_me', primaryCurrency: 'UAH' };
    // Витрата з пасиву знак не перевертає, переказ — перевертає. Якби такий
    // рядок мігрував, застосований і відкочений ефект не зійшлися б.
    expect(resolveEffectDelta(before, effectBefore, 1, liability)).toBe(-AMOUNT);
    expect(resolveEffectDelta(after, effectAfter, 1, liability)).toBe(AMOUNT);
  });
});
