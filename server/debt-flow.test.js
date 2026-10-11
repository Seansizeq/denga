import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Борги наскрізь: справжній процес API на тимчасовій базі, запити по HTTP,
 * баланси — з відповіді сервера.
 *
 * Юніт-тести `debt.js` і `transaction-effects.js` перевіряють правила, але не
 * те, що кожна дорога запису — створення боргу з рахунком, кнопка в картці,
 * звичайний переказ, витрата «з боргу», видалення — справді через них іде.
 *
 * Курс заморожено в `app_cache` (1 USD = 40 ₴ = 4 zł) ще до старту сервера,
 * інакше суми з перерахунком залежали б від мережі.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const PORT = 3231;
const BASE = `http://127.0.0.1:${PORT}`;
const AUTH = { 'x-telegram-init-data': 'dev-bypass', 'Content-Type': 'application/json' };
const USER = 'debtflow';

let workDir;
let dbPath;
let proc;
let output = [];

const api = async (method, url, body) => {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: AUTH,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const balances = async () => {
  const { body } = await api('GET', '/api/accounts');
  return Object.fromEntries(body.map((row) => [row.name, row.primaryAmount]));
};

const createAccount = async (fields) => {
  const res = await api('POST', '/api/accounts', {
    sortIndex: 10,
    primaryCurrency: 'UAH',
    iconTone: fields.section === 'debt' ? 'debt' : fields.section,
    ...fields,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
};

beforeAll(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'denga-debt-flow-'));
  dbPath = path.join(workDir, 'test.sqlite');
  const seed = await open({ filename: dbPath, driver: sqlite3.Database });
  await seed.exec('CREATE TABLE IF NOT EXISTS app_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL)');
  const far = '2999-01-01T00:00:00.000Z';
  await seed.run('INSERT INTO app_cache (key, value, updatedAt) VALUES (?, ?, ?)', [
    'fx_rates',
    JSON.stringify({ base: 'USD', rates: { USD: 1, UAH: 40, PLN: 4 }, updatedAt: far }),
    far,
  ]);
  await seed.close();

  await new Promise((resolve, reject) => {
    proc = spawn(process.execPath, [path.join('server', 'api.js')], {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ALLOW_DEV_AUTH_BYPASS: '1',
        DEV_AUTH_USER_ID: USER,
        DATABASE_PATH: dbPath,
        PORT: String(PORT),
        TELEGRAM_BOT_TOKEN: '',
        API_RATE_LIMIT_PER_MIN: '100000',
        USER_RATE_LIMIT_PER_MIN: '100000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const collect = (chunk) => {
      output.push(String(chunk));
      if (/server running/i.test(String(chunk))) resolve();
    };
    proc.stdout.on('data', collect);
    proc.stderr.on('data', collect);
    proc.on('exit', (code) => reject(new Error(`api вийшов з кодом ${code}\n${output.join('')}`)));
    setTimeout(() => reject(new Error(`api не піднявся за 25 с\n${output.join('')}`)), 25_000);
  });
}, 60_000);

afterAll(async () => {
  if (proc && proc.exitCode === null) {
    await new Promise((resolve) => {
      proc.once('exit', resolve);
      proc.kill();
      setTimeout(resolve, 3000);
    });
  }
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe('борг «мені винні»: позичив, повернули, позичив ще', () => {
  let card;
  let wallet;
  let debt;

  it('борг із рахунком грошей знімає їх з картки й показує, звідки вони', async () => {
    card = await createAccount({ name: 'Картка', section: 'bank', primaryAmount: 10000 });
    wallet = await createAccount({ name: 'Злоті', section: 'cash', primaryAmount: 1000, primaryCurrency: 'PLN' });
    debt = await createAccount({
      name: 'Михайло',
      section: 'debt',
      debtDirection: 'owed_to_me',
      primaryAmount: 1000,
      fundingAccountKey: card.accountKey,
    });

    expect(await balances()).toMatchObject({ Картка: 9000, Михайло: 1000 });
    const history = await api('GET', `/api/accounts/${debt.accountKey}/debt-history`);
    expect(history.body.entries.map((e) => [e.kind, e.delta, e.counterpartAccountKey])).toEqual([
      ['increase', 1000, card.accountKey],
    ]);
    expect(history.body).toMatchObject({ total: 1000, repaid: 0 });
  });

  it('повернення і добір рухають і борг, і картку; прогрес не скидається', async () => {
    const repaid = await api('POST', `/api/accounts/${debt.accountKey}/debt-movement`, {
      kind: 'repayment',
      amount: 300,
      paymentAccountKey: card.accountKey,
    });
    expect(repaid.status).toBe(200);
    expect(repaid.body.transaction).toMatchObject({ categoryId: 'debt_return', note: null });

    const lent = await api('POST', `/api/accounts/${debt.accountKey}/debt-movement`, {
      kind: 'increase',
      amount: 500,
      paymentAccountKey: card.accountKey,
      date: '2026-10-01',
    });
    expect(lent.status).toBe(200);
    expect(lent.body.transaction).toMatchObject({ categoryId: 'debt_lend', date: '2026-10-01T00:00:00.000Z' });

    expect(await balances()).toMatchObject({ Картка: 8800, Михайло: 1200 });
    const history = await api('GET', `/api/accounts/${debt.accountKey}/debt-history`);
    expect(history.body).toMatchObject({ balance: 1200, total: 1500, repaid: 300 });
    expect(history.body.progress).toBeCloseTo(0.2);
  });

  it('гривневий борг повертається на злотий рахунок за курсом', async () => {
    const res = await api('POST', `/api/accounts/${debt.accountKey}/debt-movement`, {
      amount: 100,
      paymentAccountKey: wallet.accountKey,
    });
    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({
      amount: 100,
      currency: 'UAH',
      transferToAmount: 10,
      transferToCurrency: 'PLN',
    });
    expect(await balances()).toMatchObject({ Злоті: 1010, Михайло: 1100 });
  });

  it('старий шлях /payment досі приймає повернення', async () => {
    const res = await api('POST', `/api/accounts/${debt.accountKey}/payment`, {
      amount: 100,
      paymentAccountKey: card.accountKey,
    });
    expect(res.status).toBe(200);
    expect(await balances()).toMatchObject({ Михайло: 1000, Картка: 8900 });
  });

  it('не дає повернути більше, ніж винні', async () => {
    const res = await api('POST', `/api/accounts/${debt.accountKey}/debt-movement`, {
      amount: 5000,
      paymentAccountKey: card.accountKey,
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'DEBT_PAYMENT_EXCEEDS_BALANCE', available: 1000 });
  });

  it('напрямок боргу з операціями не перемикається', async () => {
    const res = await api('PUT', `/api/accounts/${debt.accountKey}`, {
      name: 'Михайло',
      section: 'debt',
      sortIndex: 10,
      primaryCurrency: 'UAH',
      iconTone: 'debt',
      debtDirection: 'owed_by_me',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DEBT_DIRECTION_LOCKED');
    // Перейменувати при цьому можна.
    const renamed = await api('PUT', `/api/accounts/${debt.accountKey}`, {
      name: 'Михайло Б.',
      section: 'debt',
      sortIndex: 10,
      primaryCurrency: 'UAH',
      iconTone: 'debt',
      debtDirection: 'owed_to_me',
    });
    expect(renamed.status).toBe(200);
  });

  it('видалення повернення ставить борг і картку туди, де вони були', async () => {
    const history = await api('GET', `/api/accounts/${debt.accountKey}/debt-history`);
    const firstRepayment = history.body.entries.filter((e) => e.kind === 'repayment').at(-1);
    const before = await balances();
    const res = await api('DELETE', `/api/transactions/${firstRepayment.transactionId}`);
    expect(res.status).toBe(204);
    const after = await balances();
    expect(after['Михайло Б.']).toBe(before['Михайло Б.'] + 300);
    expect(after['Картка']).toBe(before['Картка'] - 300);
  });

  it('борг без рахунку грошей створюється, як і раніше, просто числом', async () => {
    const plain = await createAccount({ name: 'Оля', section: 'debt', debtDirection: 'owed_to_me', primaryAmount: 250 });
    expect(plain.primaryAmount).toBe(250);
    const history = await api('GET', `/api/accounts/${plain.accountKey}/debt-history`);
    expect(history.body.entries.map((e) => [e.kind, e.delta])).toEqual([['opening', 250]]);
  });

  it('відʼємного боргу не буває', async () => {
    const res = await api('POST', '/api/accounts', {
      name: 'Мінус',
      section: 'debt',
      sortIndex: 10,
      primaryAmount: -5,
      primaryCurrency: 'UAH',
      iconTone: 'debt',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DEBT_AMOUNT_NEGATIVE');
  });
});

describe('борг «я винен»: витрата з боргу, повернення переказом', () => {
  let card;
  let loan;

  it('витрата, яку оплатив хтось інший, збільшує мій борг, а видалення її знімає', async () => {
    card = await createAccount({ name: 'Друга картка', section: 'bank', primaryAmount: 5000 });
    loan = await createAccount({ name: 'Брат', section: 'debt', debtDirection: 'owed_by_me', primaryAmount: 2000 });

    const expense = await api('POST', '/api/transactions', {
      amount: 300,
      currency: 'UAH',
      type: 'expense',
      categoryId: 'food',
      accountKey: loan.accountKey,
    });
    expect(expense.status).toBe(201);
    expect((await balances()).Брат).toBe(2300);

    expect((await api('DELETE', `/api/transactions/${expense.body.id}`)).status).toBe(204);
    expect((await balances()).Брат).toBe(2000);
  });

  it('звичайний переказ на борг — це повернення: і за категорією, і в історії', async () => {
    const transfer = await api('POST', '/api/transactions', {
      amount: 500,
      type: 'transfer',
      fromAccountKey: card.accountKey,
      toAccountKey: loan.accountKey,
    });
    expect(transfer.status).toBe(201);
    expect(transfer.body.categoryId).toBe('debt_return');
    expect(await balances()).toMatchObject({ Брат: 1500, 'Друга картка': 4500 });

    const history = await api('GET', `/api/accounts/${loan.accountKey}/debt-history`);
    expect(history.body.entries[0]).toMatchObject({ kind: 'repayment', delta: -500, managed: false });
    expect(history.body).toMatchObject({ total: 2000, repaid: 500 });
  });

  it('взяв ще — борг росте, гроші приходять на картку', async () => {
    const res = await api('POST', `/api/accounts/${loan.accountKey}/debt-movement`, {
      kind: 'increase',
      amount: 1000,
      paymentAccountKey: card.accountKey,
    });
    expect(res.status).toBe(200);
    expect(await balances()).toMatchObject({ Брат: 2500, 'Друга картка': 5500 });
  });

  it('операція за старим правилом знаку відкочується так, як була застосована', async () => {
    // Витрата, записана до виправлення: тоді вона зменшила борг на 200.
    const db = await open({ filename: dbPath, driver: sqlite3.Database });
    await db.run(
      `INSERT INTO transactions (id, user_id, amount, currency, categoryId, type, date, accountKey, legacyDebtSign)
       VALUES ('legacy-1', ?, 200, 'UAH', 'food', 'expense', ?, ?, 1)`,
      [USER, new Date().toISOString(), loan.accountKey],
    );
    await db.run('UPDATE account_portfolio SET primary_amount = primary_amount - 200 WHERE account_key = ?', [
      loan.accountKey,
    ]);
    await db.close();
    expect((await balances()).Брат).toBe(2300);

    expect((await api('DELETE', '/api/transactions/legacy-1')).status).toBe(204);
    expect((await balances()).Брат).toBe(2500);
  });

  it('рахунок з операціями не стає боргом «я винен»', async () => {
    const res = await api('PUT', `/api/accounts/${card.accountKey}`, {
      name: 'Друга картка',
      section: 'debt',
      sortIndex: 10,
      primaryCurrency: 'UAH',
      iconTone: 'bank',
      debtDirection: 'owed_by_me',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DEBT_DIRECTION_LOCKED');
  });
});
