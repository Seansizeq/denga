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
import { randomUUID } from 'node:crypto';
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

/**
 * Зміни жили у двох несумісних місцях.
 *
 * `planner_days` — рядок на день, куди писала форма календаря: з усього опису
 * там лишалося число `workedHours`, а початок і кінець зникали. Бот писав у
 * `planner_shift_entries` — скільки завгодно змін на день і зі справжнім
 * часом. Читання брало **або одне, або інше**: якщо на день був хоч один запис
 * бота, рядок дня ігнорувався цілком — і зміна, заведена руками, тихо зникала
 * з усіх підсумків. Дані лежали на місці, у звіті їх не було.
 *
 * Тут ручні зміни переїжджають у записи, після чого джерело лишається одне.
 * Рядок дня не зникає: він стає похідним кешем для крапки й символа в
 * календарі, і тут-таки перераховується сумою своїх змін.
 *
 * Що переноситься: дні з `hasShift = 1`, у яких є години або сума, і на які ще
 * немає жодного запису. День, позначений без годин і без грошей, лишається
 * просто позначеним — переносити з нього нічого.
 *
 * Час у перенесених змінах не вигадується. Його ніколи не зберігали, тож режим
 * у них — «годинами»; форма покаже тривалість і порожні поля часу замість
 * правдоподібних 09:00–17:00, яких насправді ніхто не вводив.
 */
export const plannerDaysToShiftEntries = {
  id: '004-planner-days-to-shift-entries',
  run: async (tx) => {
    /** Доба — межа, за якою будь-яке число вже помилка вводу. Див. MAX_SHIFT_HOURS. */
    const MAX_HOURS = 24;
    const now = nowIso();

    const days = await tx.all(`
      SELECT d.day AS storedDay, d.user_id AS userId, d.workedHours AS workedHours,
             d.salaryRate AS salaryRate, d.salaryAmount AS salaryAmount,
             d.salary_currency AS salaryCurrency, d.note AS note
      FROM planner_days d
      WHERE d.hasShift = 1
        AND (COALESCE(d.workedHours, 0) > 0 OR COALESCE(d.salaryAmount, 0) > 0)
    `);

    for (const row of days ?? []) {
      const userId = String(row.userId ?? '');
      // Ключ рядка — `<user_id>:<YYYY-MM-DD>`; сама дата завжди десять
      // останніх символів.
      const day = String(row.storedDay ?? '').slice(-10);
      if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;

      const existing = await tx.get(
        'SELECT COUNT(1) AS cnt FROM planner_shift_entries WHERE user_id = ? AND day = ?',
        [userId, day],
      );
      if ((Number(existing?.cnt) || 0) > 0) continue;

      const workedHours = Math.min(MAX_HOURS, Math.max(0, Number(row.workedHours) || 0));
      const salaryRate = Math.max(0, Number(row.salaryRate) || 0);
      // Сума рахується зі ставки тут-таки, а не при кожному читанні.
      //
      // Рядок дня зберігав ставку й години окремо, а гроші показував добутком,
      // порахованим на льоту. Запис зміни так не вміє — у нього сума лежить
      // полем. Якби ми перенесли нуль, зміна на 6,5 години по 40 за годину
      // після міграції коштувала б нічого.
      const storedAmount = Math.max(0, Number(row.salaryAmount) || 0);
      const salaryAmount = storedAmount > 0
        ? storedAmount
        : Number((salaryRate * workedHours).toFixed(2));
      const currency = String(row.salaryCurrency ?? '').toUpperCase() === 'PLN' ? 'PLN' : 'UAH';
      // Опівдні — щоб мітка була всередині свого дня в будь-якому поясі й
      // порядок змін лишався визначеним.
      const noonIso = `${day}T12:00:00.000Z`;

      await tx.run(
        `INSERT INTO planner_shift_entries
         (id, user_id, day, started_at, ended_at, worked_hours, salary_rate, salary_amount,
          salary_currency, note, template_id, start_time, end_time, entry_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '', '', 'hours', ?, ?)`,
        [
          randomUUID(),
          userId,
          day,
          noonIso,
          noonIso,
          workedHours,
          salaryRate,
          salaryAmount,
          currency,
          String(row.note ?? '').trim(),
          now,
          now,
        ],
      );
    }

    // Зміни бота мають справжні мітки часу, але порожні `start_time`/`end_time`:
    // колонок не було. Відновлюємо їх із міток у поясі користувача — інакше
    // форма показала б порожнечу там, де час насправді відомий.
    const botEntries = await tx.all(`
      SELECT e.id AS id, e.started_at AS startedAt, e.ended_at AS endedAt,
             COALESCE(u.timezone, 'Europe/Warsaw') AS timezone
      FROM planner_shift_entries e
      LEFT JOIN users u ON u.telegram_id = CAST(e.user_id AS INTEGER)
      WHERE e.start_time = '' AND e.started_at <> e.ended_at
    `);

    // Формат розібраний тут, а не спільним помічником: міграція — знімок
    // поведінки на момент, коли її написали, і зміна помічника не має її
    // «поїхати».
    const timeInZone = (iso, timeZone) => {
      const date = new Date(String(iso ?? ''));
      if (Number.isNaN(date.getTime())) return '';
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).formatToParts(date);
        const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
        if (!map.hour || !map.minute) return '';
        return `${map.hour === '24' ? '00' : map.hour}:${map.minute}`;
      } catch {
        return '';
      }
    };

    for (const entry of botEntries ?? []) {
      const startTime = timeInZone(entry.startedAt, entry.timezone);
      const endTime = timeInZone(entry.endedAt, entry.timezone);
      if (!startTime || !endTime || startTime === endTime) continue;
      await tx.run(
        `UPDATE planner_shift_entries
         SET start_time = ?, end_time = ?, entry_mode = 'range', updated_at = ?
         WHERE id = ?`,
        [startTime, endTime, now, entry.id],
      );
    }

    // Рядок дня одразу приводиться до суми своїх змін — інакше він лишився б із
    // числами, які більше ніхто не читає, до першої правки.
    await tx.run(
      `UPDATE planner_days SET
         workedHours = COALESCE((
           SELECT SUM(e.worked_hours) FROM planner_shift_entries e
           WHERE e.user_id = planner_days.user_id AND e.day = substr(planner_days.day, -10)
         ), workedHours),
         salaryAmount = COALESCE((
           SELECT SUM(e.salary_amount) FROM planner_shift_entries e
           WHERE e.user_id = planner_days.user_id AND e.day = substr(planner_days.day, -10)
         ), salaryAmount),
         updatedAt = ?
       WHERE EXISTS (
         SELECT 1 FROM planner_shift_entries e
         WHERE e.user_id = planner_days.user_id AND e.day = substr(planner_days.day, -10)
       )`,
      [now],
    );
  },
};

export const MIGRATIONS = [
  customCategoriesUserScopedKey,
  legacyTransactionCurrencyFromNote,
  userDataVersionCounters,
  plannerDaysToShiftEntries,
];
