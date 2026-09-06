/**
 * Вмикає стиснення на живому сервері, нічого не ламаючи.
 *
 * На відміну від `setup_domain.js`, цей скрипт **не переписує блок `server`** і
 * **не чіпає certbot**. Він кладе один файл у `conf.d` (тобто в `http`-контекст),
 * перевіряє конфіг через `nginx -t` і робить `reload`. Якщо перевірка не
 * пройшла — файл прибирається, і nginx лишається на попередньому конфізі.
 *
 * Саме заради цього поділу конфіг живе в `server/nginx-config.js`: стиснення
 * можна ввімкнути окремо від усього іншого, за кілька секунд і без простою.
 *
 *   node scripts/apply-nginx-tuning.js            — застосувати
 *   node scripts/apply-nginx-tuning.js --dry-run  — лише показати, що поїде
 */
import { readFileSync, existsSync } from 'fs';
import { NodeSSH } from 'node-ssh';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTuningConf, writeRemoteFile } from '../server/nginx-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.deploy.env');

const TUNING_PATH = '/etc/nginx/conf.d/denga-tuning.conf';
const dryRun = process.argv.includes('--dry-run');

const conf = buildTuningConf();

if (dryRun) {
  console.log(`--- ${TUNING_PATH} ---\n${conf}`);
  console.log('(--dry-run: на сервер нічого не відправлено)');
  process.exit(0);
}

if (!existsSync(envPath)) {
  console.error('[nginx-tuning] Немає .deploy.env. Скопіюйте .deploy.env.example і заповніть.');
  process.exit(1);
}
dotenv.config({ path: envPath });

const { DEPLOY_HOST, DEPLOY_USER = 'root', DEPLOY_PASSWORD, DEPLOY_PRIVATE_KEY_PATH } = process.env;
if (!DEPLOY_HOST) {
  console.error('[nginx-tuning] DEPLOY_HOST обовʼязковий у .deploy.env');
  process.exit(1);
}

const ssh = new NodeSSH();
let failed = false;

try {
  console.log(`Підключення до ${DEPLOY_USER}@${DEPLOY_HOST}...`);
  await ssh.connect({
    host: DEPLOY_HOST,
    username: DEPLOY_USER,
    password: DEPLOY_PASSWORD || undefined,
    privateKey: DEPLOY_PRIVATE_KEY_PATH && existsSync(DEPLOY_PRIVATE_KEY_PATH)
      ? readFileSync(DEPLOY_PRIVATE_KEY_PATH, 'utf8')
      : undefined,
  });

  // Копія попереднього стану — щоб було куди повернутися, якщо файл уже був.
  await ssh.execCommand(`test -f ${TUNING_PATH} && cp ${TUNING_PATH} ${TUNING_PATH}.bak || true`);

  console.log(`Записую ${TUNING_PATH}...`);
  const written = await ssh.execCommand(writeRemoteFile(TUNING_PATH, conf));
  if (written.code !== 0) throw new Error(`запис не вдався: ${written.stderr || written.stdout}`);

  console.log('Перевірка конфігу (nginx -t)...');
  const test = await ssh.execCommand('nginx -t');
  if (test.code !== 0) {
    // Не лишаємо по собі конфіг, який nginx не приймає: наступний рестарт
    // сервера (з будь-якої причини) не підняв би його взагалі.
    console.error(test.stderr || test.stdout);
    await ssh.execCommand(
      `test -f ${TUNING_PATH}.bak && mv ${TUNING_PATH}.bak ${TUNING_PATH} || rm -f ${TUNING_PATH}`,
    );
    throw new Error('nginx відхилив конфіг — зміни відкочено, сервер працює як раніше');
  }

  console.log('Перезавантаження nginx...');
  const reload = await ssh.execCommand('nginx -s reload || systemctl reload nginx');
  if (reload.code !== 0) throw new Error(`reload не вдався: ${reload.stderr || reload.stdout}`);
  await ssh.execCommand(`rm -f ${TUNING_PATH}.bak`);

  // Доказ, а не сподівання: просимо стиснуту відповідь і дивимось заголовок.
  const domain = process.env.DEPLOY_DOMAIN || 'denga.vibelearn.site';
  const probe = await ssh.execCommand(
    `curl -s -o /dev/null -D - -H 'Accept-Encoding: gzip' https://${domain}/ | tr -d '\\r'`,
  );
  const encoded = /content-encoding:\s*gzip/i.test(probe.stdout);
  console.log('');
  console.log(encoded
    ? '✔ Стиснення працює: сервер відповів Content-Encoding: gzip'
    : '⚠ Перевірка не побачила gzip. Заголовки відповіді:\n' + probe.stdout.trim());
  if (!encoded) failed = true;
} catch (error) {
  console.error('[nginx-tuning]', error.message);
  failed = true;
} finally {
  ssh.dispose();
}

process.exit(failed ? 1 : 0);
