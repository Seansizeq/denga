/**
 * Що робити з балансом, коли рахунок редагують у формі.
 *
 * Форма рахунку — це не лише баланс: там назва, значок, розділ. Раніше вона
 * завжди надсилала баланс цілком, тим числом, яке бачила при відкритті. Якщо
 * поки форма була відкрита, на рахунок лягла операція з банку чи з бота,
 * перейменування повертало старий баланс — а різницю записувало як «корекцію».
 * Операція лишалася в історії, але на балансі її вже не було.
 *
 * Тепер баланс приходить лише тоді, коли його справді змінили, і разом із
 * числом, від якого відштовхувалися. Розбіжність означає, що рахунок рухався,
 * поки його редагували, — тоді ми не вгадуємо, а питаємо людину.
 */

const EPSILON = 1e-6;

/**
 * @param {object} input
 * @param {number} input.stored баланс у базі зараз
 * @param {number | undefined} input.requested новий баланс; `undefined` — не змінювали
 * @param {number | undefined} input.expected баланс, від якого редагували
 * @param {boolean} input.unitChanged чи змінилася валюта (одиниця) рахунку
 * @returns {{ ok: false, code: 'ACCOUNT_BALANCE_CHANGED', currentAmount: number }
 *   | { ok: true, nextAmount: number, delta: number, recordDelta: boolean }}
 */
export const planAccountBalanceEdit = ({ stored, requested, expected, unitChanged }) => {
  const current = Number(stored) || 0;
  if (requested === undefined) {
    return { ok: true, nextAmount: current, delta: 0, recordDelta: false };
  }
  if (expected !== undefined && Math.abs(current - expected) > EPSILON) {
    return { ok: false, code: 'ACCOUNT_BALANCE_CHANGED', currentAmount: current };
  }
  const delta = requested - current;
  return {
    ok: true,
    nextAmount: requested,
    delta,
    // Зміна валюти — це нове визначення рахунку, а не рух грошей. Різниця між
    // 1000 ₴ і 25 $ не є ні доходом, ні витратою, і записувати її корекцією
    // «−975 USD» означало б вигадати подію, якої не було.
    recordDelta: !unitChanged && Math.abs(delta) > EPSILON,
  };
};
