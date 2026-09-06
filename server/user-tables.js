/**
 * Де лежать дані користувача.
 *
 * Зовнішніх ключів у схемі немає, а отже немає й `ON DELETE CASCADE`: видалення
 * акаунта — це явний список таблиць. Ціна такого рішення рівно одна, і вона вже
 * реалізувалася: `debt_events`, `category_prefs` і `expense_templates` свого
 * часу забули дописати, і їхні рядки переживали видалення акаунта.
 *
 * Тому список живе окремим модулем — щоб тест міг звірити його зі справжньою
 * схемою й впасти, коли зʼявиться таблиця з `user_id`, якої тут немає.
 */

/** Порядок видалення. Похідні дані йдуть перед тими, на що посилаються. */
export const USER_TABLES = [
  'transactions',
  'custom_categories',
  'category_prefs',
  'subscriptions',
  'expense_templates',
  'planner_days',
  'planner_shift_entries',
  'planner_shift_templates',
  'planner_user_settings',
  'account_portfolio',
  'bot_active_shifts',
  'bot_report_settings',
  'bot_report_deliveries',
  'user_reminders',
  'reminder_deliveries',
  'category_budgets',
  'budget_alerts',
  'debt_events',
  'goals',
  'goal_contributions',
  'report_queue',
  'feature_usage',
  // Строго останнім. Лічильник версії ведуть тригери на `transactions` і
  // `account_portfolio`, тож видалення рядків із тих таблиць його тут-таки
  // відтворює. Прибраний раніше за них, він просто зʼявився б знову.
  'user_data_version',
];

/**
 * Таблиці, які мають `user_id`, але навмисно не чистяться разом з акаунтом.
 * Порожньо — і хай так лишається; кожен запис тут має пояснювати, чому дані
 * людини переживають видалення її акаунта.
 */
export const USER_TABLES_INTENTIONALLY_SKIPPED = [];

/**
 * Усі таблиці поточної схеми, що мають колонку `user_id`.
 * Використовує `PRAGMA table_info`, тобто читає справжню базу, а не наші наміри.
 */
export const tablesWithUserColumn = async (db) => {
  const tables = await db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const out = [];
  for (const { name } of tables ?? []) {
    const columns = await db.all(`PRAGMA table_info("${name}")`);
    if ((columns ?? []).some((c) => c.name === 'user_id')) out.push(name);
  }
  return out;
};

/**
 * Видаляє всі дані користувача. Викликач відповідає за транзакцію — видалення
 * має бути неподільним, інакше обірваний запит лишає половину акаунта.
 */
export const deleteUserData = async (tx, userId) => {
  for (const table of USER_TABLES) {
    await tx.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
  }
  await tx.run('DELETE FROM users WHERE telegram_id = ?', [Number(userId)]);
};
