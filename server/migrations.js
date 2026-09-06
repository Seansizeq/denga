/**
 * Нумеровані міграції, що виконуються один раз.
 *
 * Схема досі приводилася до потрібного стану ідемпотентно: `CREATE TABLE IF NOT
 * EXISTS` плюс `ALTER TABLE` у `try/catch`. Для оголошення таблиць це працює й
 * далі — дешево й не вимагає жодного обліку.
 *
 * Але переливання **даних** так робити не можна. `backfillLegacyTransactionCurrency`
 * читав усі транзакції всіх користувачів при кожному старті: на порожній базі
 * непомітно, на базі з тисячею людей — мільйони рядків на кожен деплой, і
 * жодної користі, бо переливати давно нічого. Такі кроки мають виконатися раз і
 * більше ніколи.
 *
 * Облік ведеться в `app_cache` — таблиці, яка вже є. Окрема таблиця
 * `schema_migrations` тут нічого б не додала, крім ще одного рядка в схемі.
 */
import { withTransaction } from './transaction.js';

export const MIGRATIONS_CACHE_KEY = 'schema_migrations';

/** Які міграції вже виконано. Невідомий/зіпсований запис читається як «жодної». */
export const readAppliedMigrations = async (db) => {
  try {
    const row = await db.get('SELECT value FROM app_cache WHERE key = ?', [MIGRATIONS_CACHE_KEY]);
    const parsed = row?.value ? JSON.parse(row.value) : null;
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const writeAppliedMigrations = async (dbConn, ids) => {
  await dbConn.run(
    `INSERT INTO app_cache (key, value, updatedAt) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
    [MIGRATIONS_CACHE_KEY, JSON.stringify(ids), new Date().toISOString()],
  );
};

/**
 * Виконати те, чого ще не виконували.
 *
 * Кожна міграція йде у власній транзакції разом із записом про себе: або крок
 * застосувався і відмічений, або не сталося ні того, ні іншого. Півдороги —
 * найгірший можливий стан для переливання даних, бо повторний запуск почав би
 * з уже зміненої бази.
 *
 * Порядок — той, у якому міграції передані. Помилка спиняє все: наступні кроки
 * зазвичай розраховують на попередні, і виконати їх поверх недоробленої бази
 * гірше, ніж не стартувати взагалі.
 *
 * @param {object} db
 * @param {Array<{ id: string, run: (tx: object) => Promise<unknown> }>} migrations
 * @param {{ logger?: Console }} [options]
 * @returns {Promise<{ applied: string[], skipped: string[] }>}
 */
export async function runMigrations(db, migrations, { logger = console } = {}) {
  const seen = new Set();
  for (const m of migrations) {
    if (!m?.id || typeof m.run !== 'function') throw new Error('runMigrations: міграція має мати id і run()');
    if (seen.has(m.id)) throw new Error(`runMigrations: дубльований id "${m.id}"`);
    seen.add(m.id);
  }

  const applied = await readAppliedMigrations(db);
  const done = new Set(applied);
  const result = { applied: [], skipped: [] };

  for (const migration of migrations) {
    if (done.has(migration.id)) {
      result.skipped.push(migration.id);
      continue;
    }
    logger.log?.('[migration] %s — виконую', migration.id);
    const startedAt = Date.now();
    await withTransaction(db, async (tx) => {
      await migration.run(tx);
      done.add(migration.id);
      await writeAppliedMigrations(tx, [...done]);
    });
    result.applied.push(migration.id);
    logger.log?.('[migration] %s — готово за %d мс', migration.id, Date.now() - startedAt);
  }
  return result;
}

/**
 * Перестворення таблиці зі зміною первинного ключа.
 *
 * SQLite не вміє змінювати первинний ключ через `ALTER TABLE`, тож єдиний шлях —
 * створити нову таблицю, перелити рядки, викинути стару й перейменувати. Тут це
 * зібрано в одному місці, бо кроків чотири й пропустити один легко.
 *
 * Викликається **всередині** транзакції міграції: половина цієї послідовності —
 * це втрачена таблиця.
 *
 * @param {object} tx
 * @param {{ table: string, createSql: (tmpName: string) => string, columns: string[],
 *           indexes?: string[] }} spec
 */
export const recreateTable = async (tx, { table, createSql, columns, indexes = [] }) => {
  const tmp = `${table}__migrating`;
  const columnList = columns.join(', ');

  await tx.exec(`DROP TABLE IF EXISTS ${tmp}`);
  await tx.exec(createSql(tmp));
  await tx.run(`INSERT INTO ${tmp} (${columnList}) SELECT ${columnList} FROM ${table}`);
  await tx.exec(`DROP TABLE ${table}`);
  await tx.exec(`ALTER TABLE ${tmp} RENAME TO ${table}`);
  for (const indexSql of indexes) await tx.exec(indexSql);
};
