import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Ролі процесів — перший тест, що піднімає **справжній** сервер і стукає в
 * справжні маршрути.
 *
 * Досі жоден із 65 маршрутів не був покритий: `index.js` на верхньому рівні
 * піднімає базу, бота й порт, тож імпортувати його з тесту було неможливо.
 * Роль `api` це відмикає — процес без бота й планувальників, з базою у
 * тимчасовому файлі, стартує за секунди.
 *
 * Запускаємо саме окремим процесом, а не імпортом: тест має перевірити те, що
 * побачить pm2, включно з тим, які частини система піднімає, а які ні.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

let workDir;
/** @type {Map<string, {proc: import('child_process').ChildProcess, out: string[]}>} */
const running = new Map();

const AUTH = { 'x-telegram-init-data': 'dev-bypass', 'Content-Type': 'application/json' };

const startRole = (script, port) =>
  new Promise((resolve, reject) => {
    const out = [];
    const proc = spawn(process.execPath, [path.join('server', script)], {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ALLOW_DEV_AUTH_BYPASS: '1',
        DEV_AUTH_USER_ID: 'roletest',
        DATABASE_PATH: path.join(workDir, `${script}.sqlite`),
        PORT: String(port),
        // Токена немає навмисно: жодна роль не має намагатися підняти опитування.
        TELEGRAM_BOT_TOKEN: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const collect = (chunk) => {
      const text = String(chunk);
      out.push(text);
      if (/server running|процес без HTTP/i.test(text)) resolve({ proc, out });
    };
    proc.stdout.on('data', collect);
    proc.stderr.on('data', collect);
    proc.on('exit', (code) => reject(new Error(`${script} вийшов з кодом ${code}\n${out.join('')}`)));
    setTimeout(() => reject(new Error(`${script} не піднявся за 25 с\n${out.join('')}`)), 25_000);
  }).then((started) => {
    running.set(script, started);
    return started;
  });

const logOf = (script) => running.get(script).out.join('');

beforeAll(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'denga-roles-'));
  await Promise.all([startRole('api.js', 3211), startRole('bot.js', 3212)]);
}, 60_000);

afterAll(async () => {
  await Promise.all(
    [...running.values()].map(
      ({ proc }) =>
        new Promise((resolve) => {
          if (proc.exitCode !== null) return resolve(undefined);
          proc.once('exit', resolve);
          proc.kill();
          // Не чекаємо вічно: тест уже зробив свою справу.
          setTimeout(resolve, 3000);
        }),
    ),
  );
  try {
    fs.rmSync(workDir, { recursive: true, force: true });
  } catch {
    // Windows тримає файл бази ще якийсь час після смерті процесу. Це смітник
    // у тимчасовому каталозі, а не привід валити зелений прогін.
  }
});

const api = (path, init) => fetch(`http://127.0.0.1:3211${path}`, { headers: AUTH, ...init });

describe('роль api', () => {
  it('віддає маршрути', async () => {
    const res = await api('/api/accounts');
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('пише й читає транзакцію наскрізь', async () => {
    const created = await api('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({ amount: 42, currency: 'UAH', categoryId: 'food', type: 'expense', note: 'тест ролей' }),
    });
    expect(created.status).toBe(201);

    const list = await (await api('/api/transactions')).json();
    expect(list.some((t) => t.note === 'тест ролей')).toBe(true);
  });

  it('віддає знімок з ETag і відповідає 304 на повтор', async () => {
    const first = await api('/api/sync');
    const etag = first.headers.get('etag');
    expect(first.status).toBe(200);
    expect(etag).toBeTruthy();

    const second = await api('/api/sync', { headers: { ...AUTH, 'If-None-Match': etag } });
    expect(second.status).toBe(304);
  });

  it('не піднімає ні бота, ні планувальників', () => {
    const log = logOf('api.js');
    expect(log).toMatch(/server running/i);
    // Жодного сліду бот-частини: саме це дозволяє запускати кілька копій.
    expect(log).not.toMatch(/autopay|auto reports|outbox/i);
  });
});

describe('роль bot', () => {
  it('не займає HTTP-порт — його тримає API', async () => {
    expect(logOf('bot.js')).toMatch(/процес без HTTP/);
    await expect(fetch('http://127.0.0.1:3212/api/accounts')).rejects.toThrow();
  });

  it('прогонить міграції, як і будь-яка роль', () => {
    expect(logOf('bot.js')).toMatch(/\[migration\]/);
  });
});
