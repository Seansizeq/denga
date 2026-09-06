import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_CACHE_KEY, readAppliedMigrations, recreateTable, runMigrations } from './migrations.js';

let db;

beforeEach(async () => {
  db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE app_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL)`);
});

afterEach(async () => {
  await db.close();
});

const silent = { logger: { log: () => {} } };
const step = (id, run = async () => {}) => ({ id, run });

describe('runMigrations', () => {
  it('виконує кожен крок один раз', async () => {
    const calls = [];
    const list = [step('a', async () => calls.push('a')), step('b', async () => calls.push('b'))];

    const first = await runMigrations(db, list, silent);
    const second = await runMigrations(db, list, silent);

    expect(calls).toEqual(['a', 'b']);
    expect(first.applied).toEqual(['a', 'b']);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(['a', 'b']);
  });

  it('виконує лише нові кроки, дописані пізніше', async () => {
    await runMigrations(db, [step('a')], silent);
    const calls = [];
    await runMigrations(db, [step('a', async () => calls.push('a')), step('b', async () => calls.push('b'))], silent);

    expect(calls).toEqual(['b']);
    expect(await readAppliedMigrations(db)).toEqual(['a', 'b']);
  });

  it('не відмічає крок, який упав, і не йде далі', async () => {
    const calls = [];
    const list = [
      step('a', async () => calls.push('a')),
      step('b', async () => { throw new Error('крок b зламався'); }),
      step('c', async () => calls.push('c')),
    ];

    await expect(runMigrations(db, list, silent)).rejects.toThrow('крок b зламався');

    // «c» не має виконатися: наступні кроки зазвичай спираються на попередні.
    expect(calls).toEqual(['a']);
    expect(await readAppliedMigrations(db)).toEqual(['a']);
  });

  it('відкочує роботу кроку, що впав — відмітка й дані завжди узгоджені', async () => {
    await db.exec('CREATE TABLE t (v INTEGER)');
    const list = [step('a', async (tx) => {
      await tx.run('INSERT INTO t (v) VALUES (1)');
      throw new Error('пізно');
    })];

    await expect(runMigrations(db, list, silent)).rejects.toThrow('пізно');

    const row = await db.get('SELECT COUNT(*) AS n FROM t');
    expect(row.n).toBe(0);
    expect(await readAppliedMigrations(db)).toEqual([]);
  });

  it('не дає перевикористати id — інакше крок мовчки не виконається', async () => {
    await expect(runMigrations(db, [step('a'), step('a')], silent)).rejects.toThrow(/дубльований id/);
  });

  it('зіпсований запис обліку читається як «жодної виконаної»', async () => {
    await db.run('INSERT INTO app_cache (key, value, updatedAt) VALUES (?, ?, ?)', [
      MIGRATIONS_CACHE_KEY, 'не-json', new Date().toISOString(),
    ]);
    const calls = [];
    await runMigrations(db, [step('a', async () => calls.push('a'))], silent);
    expect(calls).toEqual(['a']);
  });
});

describe('recreateTable', () => {
  it('переносить рядки й ставить новий первинний ключ', async () => {
    await db.exec(`CREATE TABLE items (id TEXT PRIMARY KEY, owner TEXT NOT NULL, label TEXT)`);
    await db.run("INSERT INTO items (id, owner, label) VALUES ('x', 'u1', 'перший')");

    await runMigrations(db, [step('r', async (tx) => {
      await recreateTable(tx, {
        table: 'items',
        columns: ['id', 'owner', 'label'],
        createSql: (name) => `CREATE TABLE ${name} (
          id TEXT NOT NULL, owner TEXT NOT NULL, label TEXT, PRIMARY KEY (owner, id))`,
        indexes: ['CREATE INDEX idx_items_owner ON items(owner)'],
      });
    })], silent);

    // Дані на місці.
    expect(await db.all('SELECT * FROM items')).toEqual([{ id: 'x', owner: 'u1', label: 'перший' }]);
    // Той самий id в іншого власника більше не конфліктує — заради цього все й робилося.
    await db.run("INSERT INTO items (id, owner, label) VALUES ('x', 'u2', 'другий')");
    expect((await db.get('SELECT COUNT(*) AS n FROM items')).n).toBe(2);
    // А дубль у межах одного власника й далі неможливий.
    await expect(db.run("INSERT INTO items (id, owner) VALUES ('x', 'u1')")).rejects.toThrow(/UNIQUE/);
    // Індекс створено заново.
    const idx = await db.get("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_items_owner'");
    expect(idx?.name).toBe('idx_items_owner');
  });

  it('не лишає по собі тимчасової таблиці', async () => {
    await db.exec(`CREATE TABLE items (id TEXT PRIMARY KEY)`);
    await runMigrations(db, [step('r', async (tx) => {
      await recreateTable(tx, {
        table: 'items',
        columns: ['id'],
        createSql: (name) => `CREATE TABLE ${name} (id TEXT NOT NULL, PRIMARY KEY (id))`,
      });
    })], silent);

    const leftovers = await db.all("SELECT name FROM sqlite_master WHERE name LIKE '%__migrating'");
    expect(leftovers).toEqual([]);
  });
});
