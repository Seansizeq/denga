import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Підписка, яку списали і автосписання, і банк, — наскрізь: справжній процес
 * API на тимчасовій базі, операції з банку — через ярлик (той самий шлях, що й
 * пуш банку чи вебхук monobank), баланси — з відповіді сервера.
 *
 * Курс заморожено в `app_cache` (1 USD = 40 ₴ = 4 zł) ще до старту сервера.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const PORT = 3232;
const BASE = `http://127.0.0.1:${PORT}`;
const AUTH = { 'x-telegram-init-data': 'dev-bypass', 'Content-Type': 'application/json' };
const USER = 'subbankmatch';
const TODAY = new Date().toISOString().slice(0, 10);

let workDir;
let dbPath;
let proc;
let output = [];
let automationToken;
let cardKey;

const api = async (method, url, body, headers = AUTH) => {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

/** Операція з банку так, як її приносить ярлик: торговець і сума, категорію вгадує сервер. */
const bankOperation = (body) =>
  api('POST', '/api/automation/transaction', body, {
    Authorization: `Bearer ${automationToken}`,
    'Content-Type': 'application/json',
  });

const balanceOf = async (name) => {
  const { body } = await api('GET', '/api/accounts');
  return body.find((row) => row.name === name)?.primaryAmount;
};

const transactionsByNote = async (pattern) => {
  const { body } = await api('GET', '/api/transactions');
  return body.filter((row) => pattern.test(String(row.note ?? '')));
};

const createSubscription = async (fields) => {
  const res = await api('POST', '/api/subscriptions', {
    cycle: 'monthly',
    nextChargeDate: TODAY,
    categoryId: 'entertainment',
    ...fields,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
};

beforeAll(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'denga-sub-bank-'));
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
        AUTOMATION_RATE_LIMIT_PER_MIN: '100000',
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

  const card = await api('POST', '/api/accounts', {
    name: 'Картка',
    section: 'bank',
    sortIndex: 10,
    primaryCurrency: 'UAH',
    primaryAmount: 10000,
    iconTone: 'bank',
  });
  expect(card.status, JSON.stringify(card.body)).toBe(201);
  cardKey = card.body.accountKey;
  automationToken = (await api('GET', '/api/planner/automation')).body.token;
  expect(automationToken).toBeTruthy();
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

describe('спершу автосписання, потім банк', () => {
  it('автосписання знімає підписку з картки за нашим курсом', async () => {
    await createSubscription({ name: 'Netflix', amount: 15.49, currency: 'USD', accountKey: cardKey });
    await api('GET', '/api/subscriptions');
    expect(await transactionsByNote(/Subscription: Netflix/)).toHaveLength(1);
    expect(await balanceOf('Картка')).toBeCloseTo(10000 - 15.49 * 40, 2);
  });

  it('покупка на ту саму суму в іншому місці — окрема витрата, автосписання на місці', async () => {
    const res = await bankOperation({ merchant: 'Biedronka', amount: 619.6, currency: 'UAH', account: 'Картка' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.message).not.toMatch(/підписка/);
    expect(await transactionsByNote(/Subscription: Netflix/)).toHaveLength(1);
    expect(await balanceOf('Картка')).toBeCloseTo(10000 - 619.6 - 619.6, 2);
  });

  it('операція з банку прибирає автосписання й лишає себе — з категорією підписки', async () => {
    const res = await bankOperation({ merchant: 'NETFLIX.COM', amount: 638.2, currency: 'UAH', account: 'Картка' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.message).toMatch(/Це підписка «Netflix»: автосписання від \d\d\.\d\d прибрано/);

    expect(await transactionsByNote(/Subscription: Netflix/)).toEqual([]);
    const fromBank = await transactionsByNote(/^NETFLIX\.COM$/);
    expect(fromBank).toHaveLength(1);
    expect(fromBank[0]).toMatchObject({ amount: 638.2, currency: 'UAH', categoryId: 'entertainment' });
    // Картка: мінус Biedronka і мінус справжня сума з банку — автосписання повернуто.
    expect(await balanceOf('Картка')).toBeCloseTo(10000 - 619.6 - 638.2, 2);
  });

  it('друга така сама операція — вже не підписка: зводити нема з чим', async () => {
    const res = await bankOperation({ merchant: 'NETFLIX.COM', amount: 638.2, currency: 'UAH', account: 'Картка' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.message).not.toMatch(/підписка/);
    expect(await transactionsByNote(/^NETFLIX\.COM$/)).toHaveLength(2);
    expect(await balanceOf('Картка')).toBeCloseTo(10000 - 619.6 - 638.2 * 2, 2);
  });
});

describe('спершу банк, потім автосписання', () => {
  it('банк уже списав підписку — автосписання не створює другої витрати', async () => {
    const before = await balanceOf('Картка');
    const res = await bankOperation({ merchant: 'Spotify P2A8F1C0D', amount: 245, currency: 'UAH', account: 'Картка' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const sub = await createSubscription({ name: 'Spotify Premium', amount: 5.99, currency: 'USD' });
    const { body: subs } = await api('GET', '/api/subscriptions');

    expect(await transactionsByNote(/Subscription: Spotify/)).toEqual([]);
    expect(await transactionsByNote(/^Spotify/)).toHaveLength(1);
    expect(await balanceOf('Картка')).toBeCloseTo(before - 245, 2);
    // Цикл підписки пішов далі, як після звичайного списання.
    expect(subs.find((s) => s.id === sub.id).nextChargeDate > TODAY).toBe(true);
  });

  it('підписка без операції з банку списується як завжди', async () => {
    await createSubscription({ name: 'Disney+', amount: 9.99, currency: 'USD' });
    await api('GET', '/api/subscriptions');
    expect(await transactionsByNote(/Subscription: Disney\+/)).toHaveLength(1);
  });
});
