import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDb } from './db.js';

/**
 * Свіжа база має отримати ту саму схему, що й давня, яку роками доганяли
 * `ALTER TABLE … ADD COLUMN`.
 *
 * Ці `ALTER` загорнуті в try/catch — «колонка вже є». Але так само мовчки
 * ковтається й «таблиці ще немає»: `ALTER` для `planner_shift_templates`
 * стояв раніше за її `CREATE TABLE`, а в самому `CREATE` колонки `currency`
 * не було. На свіжій базі перший запуск лишав таблицю без неї, і шаблони змін
 * падали з «no such column: currency». Прод цього не бачив — там таблиця
 * давно мала колонку.
 *
 * Тест бере кожен такий `ALTER` прямо з `db.js`, тож нова колонка, додана
 * лише через `ALTER` не в тому місці, впаде тут, а не в першого користувача.
 */

const DB_SOURCE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'db.js'), 'utf8');
const ADDED_COLUMNS = [...DB_SOURCE.matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+)/g)].map(([, table, column]) => ({
  table,
  column,
}));

let workDir;
let db;
let previousDatabasePath;

beforeEach(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'denga-db-schema-'));
  previousDatabasePath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path.join(workDir, 'fresh.sqlite');
  db = await initDb();
});

afterEach(async () => {
  await db?.close();
  if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previousDatabasePath;
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe('схема свіжої бази', () => {
  it('знаходить у db.js колонки, які доганяються через ALTER', () => {
    // Захист самого тесту: якщо регулярка перестане щось знаходити, перевірка
    // нижче пройде порожньою й нічого не доведе.
    expect(ADDED_COLUMNS.length).toBeGreaterThan(20);
  });

  it('має кожну колонку, яку давня база отримала через ALTER, — уже після першого запуску', async () => {
    const missing = [];
    for (const { table, column } of ADDED_COLUMNS) {
      const columns = await db.all(`PRAGMA table_info("${table}")`);
      if (!(columns ?? []).some((c) => c.name === column)) missing.push(`${table}.${column}`);
    }
    expect(missing).toEqual([]);
  });

  it('шаблон зміни зберігає валюту', async () => {
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO planner_shift_templates (id, user_id, normalized_key, name, currency, created_at, updated_at)
       VALUES ('t1', '42', '42::нічна::🌙::PLN', 'Нічна', 'PLN', ?, ?)`,
      [now, now],
    );
    const row = await db.get(`SELECT currency FROM planner_shift_templates WHERE id = 't1'`);
    expect(row.currency).toBe('PLN');
  });
});
