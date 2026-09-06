import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { waitForPendingTransactions, withTransaction } from './transaction.js';

/**
 * Тести на те, заради чого `withTransaction` існує: одне зʼєднання на процес і
 * `BEGIN`, який діє на зʼєднання, а не на запит. Перевіряти це на балансах
 * навмисно — саме там наслідок видно як зіпсовані дані, а не як помилка.
 */

let db;

beforeEach(async () => {
  db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('CREATE TABLE accounts (key TEXT PRIMARY KEY, amount REAL NOT NULL)');
  await db.exec('CREATE TABLE moves (id INTEGER PRIMARY KEY AUTOINCREMENT, amount REAL NOT NULL)');
  await db.run("INSERT INTO accounts (key, amount) VALUES ('wallet', 0)");
});

afterEach(async () => {
  await waitForPendingTransactions();
  await db.close();
});

const balance = async () => {
  const row = await db.get("SELECT amount FROM accounts WHERE key = 'wallet'");
  return Number(row.amount);
};

/** Читання + запис із паузою між ними — форма, у якій живуть справжні обробники. */
const deposit = (amount, afterCommitCb) =>
  withTransaction(db, async (tx, afterCommit) => {
    const row = await tx.get("SELECT amount FROM accounts WHERE key = 'wallet'");
    await new Promise((resolve) => setImmediate(resolve));
    await tx.run("UPDATE accounts SET amount = ? WHERE key = 'wallet'", [Number(row.amount) + amount]);
    await tx.run('INSERT INTO moves (amount) VALUES (?)', [amount]);
    if (afterCommitCb) afterCommit(afterCommitCb);
    return amount;
  });

describe('withTransaction', () => {
  it('50 паралельних записів дають баланс, що дорівнює сумі транзакцій', async () => {
    await Promise.all(Array.from({ length: 50 }, () => deposit(10)));

    expect(await balance()).toBe(500);
    const moves = await db.get('SELECT COUNT(*) AS n, SUM(amount) AS total FROM moves');
    expect(moves.n).toBe(50);
    expect(moves.total).toBe(500);
  });

  it('не дає двом транзакціям перетнутися — читання бачить уже зафіксоване', async () => {
    const seen = [];
    const read = () =>
      withTransaction(db, async (tx) => {
        const row = await tx.get("SELECT amount FROM accounts WHERE key = 'wallet'");
        seen.push(Number(row.amount));
        await new Promise((resolve) => setImmediate(resolve));
        await tx.run("UPDATE accounts SET amount = ? WHERE key = 'wallet'", [Number(row.amount) + 1]);
      });

    await Promise.all([read(), read(), read(), read()]);

    // Кожна наступна транзакція має бачити результат попередньої, без пропусків.
    expect(seen).toEqual([0, 1, 2, 3]);
    expect(await balance()).toBe(4);
  });

  it('відкочує свою роботу й не чіпає чужу', async () => {
    const results = await Promise.allSettled([
      deposit(10),
      withTransaction(db, async (tx) => {
        await tx.run("UPDATE accounts SET amount = 999 WHERE key = 'wallet'");
        await tx.run('INSERT INTO moves (amount) VALUES (999)');
        throw new Error('навмисний збій');
      }),
      deposit(10),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(await balance()).toBe(20);
    const moves = await db.get('SELECT COUNT(*) AS n FROM moves');
    expect(moves.n).toBe(2);
  });

  it('помилка однієї транзакції не зупиняє чергу', async () => {
    await withTransaction(db, async () => {
      throw new Error('перша впала');
    }).catch(() => {});

    await deposit(7);
    expect(await balance()).toBe(7);
  });

  it('колбеки afterCommit виконуються після COMMIT і поза локом', async () => {
    let balanceSeenInsideCallback = null;

    await withTransaction(db, async (tx, afterCommit) => {
      await tx.run("UPDATE accounts SET amount = 42 WHERE key = 'wallet'");
      afterCommit(async () => {
        // Окрема транзакція всередині колбека проходить лише тому, що лок уже
        // знято, а черга нас не чекає. Саме це рятує від утримання write-lock
        // під час відправлення повідомлення в Telegram.
        balanceSeenInsideCallback = await withTransaction(db, async (inner) => {
          const row = await inner.get("SELECT amount FROM accounts WHERE key = 'wallet'");
          return Number(row.amount);
        });
      });
    });

    expect(balanceSeenInsideCallback).toBe(42);
  });

  it('збій у afterCommit не скасовує вже зафіксовану транзакцію', async () => {
    const logged = [];
    const logger = { error: (...args) => logged.push(args) };

    await withTransaction(
      db,
      async (tx, afterCommit) => {
        await tx.run("UPDATE accounts SET amount = 5 WHERE key = 'wallet'");
        afterCommit(() => {
          throw new Error('Telegram недоступний');
        });
      },
      { logger },
    );

    expect(await balance()).toBe(5);
    expect(logged).toHaveLength(1);
  });

  it('повертає значення, яке віддала функція', async () => {
    const out = await withTransaction(db, async () => ({ ok: true, id: 'abc' }));
    expect(out).toEqual({ ok: true, id: 'abc' });
  });
});
