/**
 * Де ще живе id категорії, крім транзакцій.
 *
 * У власної категорії id складається з назви, значка й кольору, тож будь-яка
 * правка її вигляду міняє id. Раніше разом з ним переїжджали лише транзакції,
 * а все інше лишалось на старому id: бюджет категорії переставав рахуватися,
 * підписка списувала в категорію, якої вже немає (і та знову зʼявлялась у
 * списку як «давня»), шаблон підставляв неіснуючу, правило торговця з банку
 * мовчки перестало працювати.
 *
 * Список таблиць тут один на перейменування й на видалення, щоб нова таблиця з
 * id категорії не загубилася в одному з двох місць.
 *
 * Викликати всередині транзакції: половина переїзду гірша за жоден.
 */

/** Рядки картки банку, у списку кнопок якої є ця категорія. */
const pickerHas = 'instr(picker_ids, ?) > 0';

/**
 * Перейменування: усе, що посилалося на `fromId`, тепер посилається на `toId`.
 *
 * `UPDATE OR REPLACE` там, де id входить у первинний ключ: якщо під новим id
 * уже лежить рядок (бюджет, який осиротів через стару ваду), перемагає той, що
 * переїжджає, — він належить категорії, яку людина щойно редагувала.
 */
export const moveCategoryReferences = async (db, userId, fromId, toId) => {
  if (!fromId || !toId || fromId === toId) return;
  const args = [toId, userId, fromId];
  await db.run('UPDATE transactions SET categoryId = ? WHERE user_id = ? AND categoryId = ?', args);
  await db.run('UPDATE subscriptions SET categoryId = ? WHERE user_id = ? AND categoryId = ?', args);
  await db.run('UPDATE expense_templates SET category_id = ? WHERE user_id = ? AND category_id = ?', args);
  await db.run('UPDATE OR REPLACE category_budgets SET category_id = ? WHERE user_id = ? AND category_id = ?', args);
  await db.run('UPDATE OR REPLACE budget_alerts SET category_id = ? WHERE user_id = ? AND category_id = ?', args);
  await db.run('UPDATE OR REPLACE category_prefs SET category_id = ? WHERE user_id = ? AND category_id = ?', args);
  await db.run('UPDATE bank_merchant_rules SET category_id = ? WHERE user_id = ? AND category_id = ?', args);
  await db.run('UPDATE bank_inbox SET category_id = ? WHERE user_id = ? AND category_id = ?', args);
  // Кнопки картки банку зберігаються JSON-масивом id. Заміна йде по id у
  // лапках, тож зачепити інший id, що лише починається так само, не вийде.
  const fromJson = JSON.stringify(fromId);
  await db.run(`UPDATE bank_inbox SET picker_ids = REPLACE(picker_ids, ?, ?) WHERE user_id = ? AND ${pickerHas}`, [
    fromJson,
    JSON.stringify(toId),
    userId,
    fromJson,
  ]);
};

/**
 * Видалення: операції, підписки й шаблони переходять у `fallbackId` («Інше»),
 * а те, що має сенс лише для цієї категорії, прибирається.
 *
 * Правило торговця саме видаляється, а не переходить в «Інше»: правило, що
 * силоміць ставить «Інше», гірше за здогад, який банк-картка зробить заново.
 */
export const releaseCategoryReferences = async (db, userId, id, fallbackId) => {
  if (!id) return;
  const move = [fallbackId, userId, id];
  const own = [userId, id];
  await db.run('UPDATE transactions SET categoryId = ? WHERE user_id = ? AND categoryId = ?', move);
  await db.run('UPDATE subscriptions SET categoryId = ? WHERE user_id = ? AND categoryId = ?', move);
  await db.run('UPDATE expense_templates SET category_id = ? WHERE user_id = ? AND category_id = ?', move);
  await db.run('UPDATE bank_inbox SET category_id = ? WHERE user_id = ? AND category_id = ?', move);
  await db.run('DELETE FROM category_budgets WHERE user_id = ? AND category_id = ?', own);
  await db.run('DELETE FROM budget_alerts WHERE user_id = ? AND category_id = ?', own);
  await db.run('DELETE FROM category_prefs WHERE user_id = ? AND category_id = ?', own);
  await db.run('DELETE FROM bank_merchant_rules WHERE user_id = ? AND category_id = ?', own);
};
