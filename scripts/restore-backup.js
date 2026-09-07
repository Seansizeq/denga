/**
 * Відновлення бази з копії.
 *
 * Друга половина будь-якої історії про бекапи — і та, якої зазвичай немає.
 * Копії робилися щодня понад місяць, але жодну з них ніхто не відновлював, а
 * неперевірена копія — це не бекап, а надія. Ще гірше робити це вперше тоді,
 * коли база вже впала: під тиском люди помиляються, а тут кожен крок
 * незворотний.
 *
 * Тому сценарій прописаний заздалегідь і сам себе перевіряє:
 *
 *   node scripts/restore-backup.js --list            показати наявні копії
 *   node scripts/restore-backup.js --verify-all      перевірити всі копії
 *   node scripts/restore-backup.js --check <файл>    перевірити копію, нічого не змінюючи
 *   node scripts/restore-backup.js --restore <файл>  відновити (з підтвердженням)
 *
 * Перед підміною скрипт завжди відкладає поточну базу вбік. Навіть якщо
 * відновлюють «бо все зламалося», зламане може виявитися ціннішим за копію —
 * наприклад, коли проблема була не в даних.
 */
import { readFileSync, existsSync } from 'fs';
import readline from 'node:readline/promises';
import { NodeSSH } from 'node-ssh';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.deploy.env');

if (!existsSync(envPath)) {
  console.error('[restore] Немає .deploy.env — нема куди підключатися.');
  process.exit(1);
}
dotenv.config({ path: envPath, quiet: true });

const {
  DEPLOY_HOST,
  DEPLOY_USER = 'root',
  DEPLOY_PASSWORD,
  DEPLOY_PRIVATE_KEY_PATH,
  DEPLOY_APP_DIR = '/root/denga',
} = process.env;

if (!DEPLOY_HOST) {
  console.error('[restore] DEPLOY_HOST обовʼязковий у .deploy.env');
  process.exit(1);
}

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const valueOf = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 ? argv[i + 1] : undefined;
};

const DB = `${DEPLOY_APP_DIR}/database.sqlite`;
const BACKUPS = `${DEPLOY_APP_DIR}/backups`;

const ssh = new NodeSSH();
const run = async (cmd) => {
  const r = await ssh.execCommand(cmd);
  return { out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim(), code: r.code };
};

/** Скільки в базі всього — швидкий спосіб порівняти копію з тим, що зараз. */
const describe = async (file) => {
  const r = await run(
    `sqlite3 '${file}' "SELECT (SELECT COUNT(*) FROM transactions)||' транзакцій, '||` +
      `(SELECT COUNT(*) FROM users)||' користувачів, '||` +
      `(SELECT COUNT(*) FROM account_portfolio)||' рахунків'" 2>&1`,
  );
  return r.out;
};

/** Копія придатна, лише якщо відкривається, проходить перевірку й віддає дані. */
const verify = async (file) => {
  if ((await run(`test -f '${file}' && echo y`)).out !== 'y') return { ok: false, reason: 'файлу немає' };
  const size = Number((await run(`stat -c%s '${file}'`)).out) || 0;
  if (size < 4096) return { ok: false, reason: `розмір лише ${size} Б — це огризок, а не база` };
  const check = (await run(`sqlite3 '${file}' 'PRAGMA quick_check(1)' 2>&1`)).out;
  if (check !== 'ok') return { ok: false, reason: `quick_check: ${check}` };
  const contents = await describe(file);
  if (/error|no such table/i.test(contents)) return { ok: false, reason: contents };
  return { ok: true, size, contents };
};

await ssh.connect({
  host: DEPLOY_HOST,
  username: DEPLOY_USER,
  password: DEPLOY_PASSWORD || undefined,
  privateKey:
    DEPLOY_PRIVATE_KEY_PATH && existsSync(DEPLOY_PRIVATE_KEY_PATH)
      ? readFileSync(DEPLOY_PRIVATE_KEY_PATH, 'utf8')
      : undefined,
});

try {
  if (flag('list') || argv.length === 0) {
    console.log(`Копії в ${BACKUPS}:\n`);
    const rows = (await run(`ls -1t ${BACKUPS}/*.sqlite 2>/dev/null | head -25`)).out;
    if (!rows) {
      console.log('  (жодної)');
    } else {
      for (const file of rows.split('\n')) {
        const size = (await run(`du -h '${file}' | cut -f1`)).out;
        const suspect = file.includes('-suspect') ? '  ⚠ не пройшла перевірку' : '';
        console.log(`  ${path.basename(file).padEnd(46)} ${size.padStart(6)}${suspect}`);
      }
    }
    console.log(`\nЗараз у базі: ${await describe(DB)}`);
    console.log('\nПеревірити копію:  node scripts/restore-backup.js --check <імʼя>');
    console.log('Відновити:         node scripts/restore-backup.js --restore <імʼя>');
  } else if (flag('verify-all')) {
    // Копія, яку ніхто не відкривав, нічим не відрізняється від справної — доки
    // вона не знадобиться. Перший же прогін знайшов пошкоджений знімок, що
    // місяць лежав серед інших і виглядав придатним.
    const files = (await run(`ls -1t ${BACKUPS}/*.sqlite 2>/dev/null`)).out;
    if (!files) { console.log('Копій немає.'); process.exit(0); }
    const list = files.split('\n');
    const broken = [];
    console.log(`Перевіряю ${list.length} копій...\n`);
    for (const file of list) {
      const v = await verify(file);
      if (!v.ok) broken.push([file, v.reason]);
      console.log(`  ${v.ok ? '✔' : '✘'} ${path.basename(file).padEnd(46)} ${v.ok ? v.contents : v.reason.slice(0, 60)}`);
    }
    console.log(`\nСправних: ${list.length - broken.length} з ${list.length}`);
    if (broken.length) {
      console.log('\nПошкоджені копії краще прибрати, щоб вони не виглядали');
      console.log('придатними в найгірший момент:');
      for (const [file] of broken) console.log(`  rm '${file}'`);
    }
    process.exitCode = broken.length ? 1 : 0;
  } else if (flag('check')) {
    const name = valueOf('check');
    const file = name.includes('/') ? name : `${BACKUPS}/${name}`;
    const v = await verify(file);
    console.log(`${path.basename(file)}: ${v.ok ? '✔ придатна' : '✘ ' + v.reason}`);
    if (v.ok) {
      console.log(`  вміст : ${v.contents}`);
      console.log(`  зараз : ${await describe(DB)}`);
    }
    process.exitCode = v.ok ? 0 : 1;
  } else if (flag('restore')) {
    const name = valueOf('restore');
    if (!name) throw new Error('вкажіть імʼя копії');
    const file = name.includes('/') ? name : `${BACKUPS}/${name}`;

    const v = await verify(file);
    if (!v.ok) throw new Error(`копія непридатна: ${v.reason}`);

    console.log('Відновлення бази Denga');
    console.log(`  звідки : ${path.basename(file)} — ${v.contents}`);
    console.log(`  куди   : ${DB} — ${await describe(DB)}`);
    console.log('');
    console.log('Поточна база буде відкладена вбік, не видалена.');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question('Продовжити? Наберіть «відновити»: ')).trim();
    rl.close();
    if (answer !== 'відновити') {
      console.log('Скасовано, нічого не змінено.');
      process.exit(0);
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const aside = `${BACKUPS}/replaced-${stamp}.sqlite`;

    // Порядок важливий: спершу зупиняємо тих, хто пише, і лише потім чіпаємо
    // файл. Підміна бази під працюючим процесом — це відкриті дескриптори на
    // файл, якого вже немає, і -wal від старої бази поруч із новою.
    console.log('\nзупиняю процеси...');
    await run('pm2 stop denga-api denga-bot');

    console.log('відкладаю поточну базу...');
    await run(`sqlite3 '${DB}' 'PRAGMA wal_checkpoint(TRUNCATE)' 2>/dev/null; cp '${DB}' '${aside}'`);
    // -wal і -shm від старої бази мають зникнути разом із нею, інакше SQLite
    // спробує застосувати чужий журнал до нового файлу.
    await run(`rm -f '${DB}-wal' '${DB}-shm'`);

    console.log('ставлю копію на місце...');
    await run(`cp '${file}' '${DB}'`);

    const after = await verify(DB);
    if (!after.ok) {
      console.error(`\n✘ Після підміни база не проходить перевірку: ${after.reason}`);
      console.error('Повертаю як було...');
      await run(`cp '${aside}' '${DB}'`);
      await run('pm2 start denga-api denga-bot');
      throw new Error('відновлення скасовано, працює попередня база');
    }

    console.log('піднімаю процеси...');
    await run('pm2 start denga-api denga-bot');
    await new Promise((r) => setTimeout(r, 8000));

    const health = (await run('curl -s http://127.0.0.1:3001/healthz')).out;
    console.log('');
    console.log(`база     : ${after.contents}`);
    console.log(`healthz  : ${health}`);
    console.log(`відкладено: ${path.basename(aside)}`);
    console.log(/"ok":true/.test(health) ? '\n✔ Відновлено' : '\n⚠ Застосунок не відповідає — подивіться pm2 logs');
  } else {
    console.log('Використання: --list | --verify-all | --check <файл> | --restore <файл>');
  }
} catch (error) {
  console.error('[restore]', error.message);
  process.exitCode = 1;
} finally {
  ssh.dispose();
}
