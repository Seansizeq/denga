/**
 * Перелік міграцій у порядку виконання.
 *
 * Живе окремо від рушія (`migrations.js`), щоб рушій можна було тестувати на
 * вигаданих кроках, а самі кроки — на справжній схемі.
 *
 * Правило одне: **виконана міграція не редагується**. Бази, де вона вже
 * пройшла, її не повторять, тож правка застосується лише до нових — і схеми
 * розʼїдуться. Потрібна зміна — нова міграція.
 */
import { recreateTable } from './migrations.js';

const nowIso = () => new Date().toISOString();

/**
 * Id власної категорії будувався з її назви:
 * `custom:%D0%9A%D0%B0%D0%B2%D0%B0|Coffee|%237C5CFF`. Це зроблено навмисно —
 * `parseCustomCategoryId()` відновлює назву, іконку й колір із самого рядка,
 * тож транзакція з такою категорією малюється навіть тоді, коли рядка в
 * `custom_categories` вже немає.
 *
 * Проблема не в форматі, а в тому, що цей id був `PRIMARY KEY` **без**
 * `user_id`. Двоє людей, що завели «Каву» з однаковою іконкою й кольором,
 * отримували один і той самий ключ: другий `INSERT` падав з
 * `UNIQUE constraint failed`, а обробник цього не чекав — назовні летів 500.
 *
 * Формат id при цьому чіпати не треба, і це важливо: він розбирається у трьох
 * місцях (`index.js`, `smart-transaction-categories.js`,
 * `src/constants/categories.ts`) і лежить у `transactions.categoryId`. Зміна
 * формату означала б переписати всі посилання в транзакціях — ризик, який тут
 * нічим не виправданий, бо **всі** запити до таблиці й так фільтрують за
 * `user_id`. Достатньо, щоб ключ був парою.
 *
 * Заодно перестворюється унікальний індекс. `CREATE UNIQUE INDEX IF NOT EXISTS`
 * не переоголошує наявний, тож на базах, старших за додавання `user_id`, він
 * лишався глобальним `(type, normalized_name)` — та сама колізія на іншому
 * рівні.
 */
export const customCategoriesUserScopedKey = {
  id: '001-custom-categories-user-scoped-key',
  run: async (tx) => {
    await recreateTable(tx, {
      table: 'custom_categories',
      columns: ['id', 'user_id', 'type', 'name', 'normalized_name', 'icon', 'color', 'createdAt', 'updatedAt'],
      createSql: (name) => `
        CREATE TABLE ${name} (
          id TEXT NOT NULL,
          user_id TEXT NOT NULL DEFAULT '',
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          normalized_name TEXT NOT NULL,
          icon TEXT NOT NULL,
          color TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          PRIMARY KEY (user_id, id)
        )`,
      indexes: [
        `CREATE UNIQUE INDEX idx_custom_categories_type_name
         ON custom_categories(user_id, type, normalized_name)`,
      ],
    });
  },
};

/**
 * Валюта транзакції колись жила в тексті примітки, а не в колонці. Перенесення
 * виконувалося при кожному старті сервера: читало **всі** транзакції всіх
 * користувачів і майже завжди не знаходило чого переносити.
 *
 * Тут воно виконується один раз. Нові транзакції валюту в примітку не пишуть
 * уже давно, тож повторювати нема сенсу.
 */
export const legacyTransactionCurrencyFromNote = {
  id: '002-legacy-transaction-currency-from-note',
  run: async (tx) => {
    // Розбір навмисно повторений тут, а не імпортований з `index.js`.
    // Міграція — знімок поведінки на момент, коли її написали: якщо спільний
    // помічник колись зміниться, вже виконана міграція від цього не «поїде», а
    // ще не виконана не почне робити щось інше, ніж задумано.
    //
    // Маркер саме такий, як у `getCurrencyFromNote`: `Currency: XXX` зі
    // словниковими межами. Простий пошук підрядка «UAH» тут був би помилкою —
    // він переписав би валюту нотатці на кшталт «переказ у UAH з картки».
    const MARKER = /\bCurrency:\s*([A-Za-z]{3})\b/i;
    const normalize = (raw) => {
      const code = String(raw ?? '').toUpperCase();
      return code === 'PLN' || code === 'USD' ? code : 'UAH';
    };
    // Одне свідоме відхилення від старої поведінки. `normalizeCurrency`
    // згортає все незнайоме до UAH, тож для транзакції в BTC вона повертала
    // «UAH» — і маркер `Currency: USD` у примітці переписав би деномінацію
    // активу на долари, знищивши суму в монеті. Маркер старший за криптовалюти,
    // тож таких рядків майже напевно немає; але «майже» тут недостатньо.
    const CRYPTO = new Set(['BTC', 'ETH', 'SOL', 'TON', 'USDT']);

    // Звужуємо вибірку до рядків, де маркер узагалі може бути: без цього
    // міграція читала б усю таблицю заради кількох правок.
    const rows = await tx.all(
      "SELECT id, note, currency FROM transactions WHERE note LIKE '%Currency:%'",
    );
    for (const row of rows ?? []) {
      if (CRYPTO.has(String(row.currency ?? '').toUpperCase())) continue;
      const match = MARKER.exec(String(row.note ?? ''));
      if (!match) continue;
      const fromNote = normalize(match[1]);
      if (fromNote === normalize(row.currency)) continue;
      await tx.run('UPDATE transactions SET currency = ? WHERE id = ?', [fromNote, row.id]);
    }
  },
};

/**
 * Лічильник версії даних користувача — основа для ETag на `/api/sync`.
 *
 * Рахується **тригерами**, а не викликами з коду, і це головне рішення тут.
 * Записів у транзакції й рахунки понад десяток місць; варто забути один — і
 * клієнт просто не побачить оновлення, бо отримає 304 на змінені дані. Такий
 * баг не падає й не логується, він тихо показує стару суму.
 *
 * Тригер забути неможливо: він спрацьовує від самого запису й усередині тієї
 * самої транзакції.
 */
export const userDataVersionCounters = {
  id: '003-user-data-version-counters',
  run: async (tx) => {
    await tx.exec(`
      CREATE TABLE IF NOT EXISTS user_data_version (
        user_id TEXT PRIMARY KEY,
        transactions_v INTEGER NOT NULL DEFAULT 0,
        accounts_v INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`);

    const bump = (name, table, column, event, row) => `
      CREATE TRIGGER IF NOT EXISTS ${name}
      AFTER ${event} ON ${table}
      BEGIN
        INSERT INTO user_data_version (user_id, transactions_v, accounts_v, updated_at)
        VALUES (${row}.user_id, ${column === 'transactions_v' ? 1 : 0}, ${column === 'accounts_v' ? 1 : 0}, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          ${column} = ${column} + 1,
          updated_at = datetime('now');
      END`;

    for (const sql of [
      bump('trg_txv_insert', 'transactions', 'transactions_v', 'INSERT', 'NEW'),
      bump('trg_txv_update', 'transactions', 'transactions_v', 'UPDATE', 'NEW'),
      bump('trg_txv_delete', 'transactions', 'transactions_v', 'DELETE', 'OLD'),
      bump('trg_accv_insert', 'account_portfolio', 'accounts_v', 'INSERT', 'NEW'),
      bump('trg_accv_update', 'account_portfolio', 'accounts_v', 'UPDATE', 'NEW'),
      bump('trg_accv_delete', 'account_portfolio', 'accounts_v', 'DELETE', 'OLD'),
    ]) {
      await tx.exec(sql);
    }

    // Стартові значення для тих, хто вже має дані: інакше перший запис підняв
    // би версію з нуля, і клієнт із кешем попередньої версії вважав би її
    // свіжою.
    await tx.run(`
      INSERT INTO user_data_version (user_id, transactions_v, accounts_v, updated_at)
      SELECT user_id, COUNT(*), 0, ? FROM transactions GROUP BY user_id
      ON CONFLICT(user_id) DO UPDATE SET transactions_v = excluded.transactions_v`,
      [nowIso()],
    );
    await tx.run(`
      INSERT INTO user_data_version (user_id, transactions_v, accounts_v, updated_at)
      SELECT user_id, 0, COUNT(*), ? FROM account_portfolio GROUP BY user_id
      ON CONFLICT(user_id) DO UPDATE SET accounts_v = excluded.accounts_v`,
      [nowIso()],
    );
  },
};

export const MIGRATIONS = [
  customCategoriesUserScopedKey,
  legacyTransactionCurrencyFromNote,
  userDataVersionCounters,
];
