import { NodeSSH } from 'node-ssh';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.deploy.env') });

const {
  DEPLOY_HOST,
  DEPLOY_USER = 'root',
  DEPLOY_PASSWORD,
  DEPLOY_PRIVATE_KEY_PATH,
  DEPLOY_APP_DIR = '/root/denga',
} = process.env;

function buildCustomId(name, icon, color) {
  return 'custom:' + encodeURIComponent(name.trim()) + '|' + icon + '|' + encodeURIComponent(color);
}

const SUBSCRIPTIONS_ID = buildCustomId('Підписки', 'Wifi', '#5E5CE6');

const inlineScript = `
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.resolve('${DEPLOY_APP_DIR}/database.sqlite');

const SUBSCRIPTIONS_NAMES = ['spotify', 'icloud', 'google one'];
const ENTERTAINMENT_NAMES = ['ігри', 'games'];
const SUBSCRIPTIONS_ID = '${SUBSCRIPTIONS_ID}';

function parseCustom(id) {
  if (!id.startsWith('custom:')) return null;
  const raw = id.slice('custom:'.length);
  const parts = raw.split('|');
  try {
    const name = parts[0] ? decodeURIComponent(parts[0]) : null;
    const icon = parts[1] || 'Tag';
    const color = parts[2] ? decodeURIComponent(parts[2]) : '#8E8E93';
    return name ? { name, icon, color } : null;
  } catch { return null; }
}

async function migrate() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.run('PRAGMA journal_mode = WAL');

  // --- transactions ---
  const txRows = await db.all(
    "SELECT DISTINCT categoryId FROM transactions WHERE categoryId LIKE 'custom:%'"
  );

  for (const { categoryId } of txRows) {
    const parsed = parseCustom(categoryId);
    if (!parsed) continue;
    const key = parsed.name.toLowerCase().trim();

    if (SUBSCRIPTIONS_NAMES.includes(key)) {
      const { changes } = await db.run(
        'UPDATE transactions SET categoryId = ? WHERE categoryId = ?',
        [SUBSCRIPTIONS_ID, categoryId]
      );
      console.log('[->Підписки]', parsed.name, '(' + changes + ' tx)');
      continue;
    }

    if (ENTERTAINMENT_NAMES.includes(key)) {
      const { changes } = await db.run(
        'UPDATE transactions SET categoryId = ? WHERE categoryId = ?',
        ['entertainment', categoryId]
      );
      console.log('[->Розваги]', parsed.name, '(' + changes + ' tx)');
    }
  }

  // --- custom_categories table ---
  const catRows = await db.all("SELECT id, name FROM custom_categories");
  for (const row of catRows) {
    const key = row.name.toLowerCase().trim();
    if (SUBSCRIPTIONS_NAMES.includes(key) || ENTERTAINMENT_NAMES.includes(key)) {
      await db.run('DELETE FROM custom_categories WHERE id = ?', [row.id]);
      console.log('[table deleted]', row.name);
    }
  }

  // --- create Підписки in custom_categories ---
  const user = await db.get("SELECT telegram_id FROM users LIMIT 1");
  if (user) {
    const userId = String(user.telegram_id);
    const existing = await db.get(
      "SELECT id FROM custom_categories WHERE user_id = ? AND normalized_name = 'підписки'",
      [userId]
    );
    if (!existing) {
      const now = new Date().toISOString();
      await db.run(
        \`INSERT INTO custom_categories (id, user_id, type, name, normalized_name, icon, color, createdAt, updatedAt)
         VALUES (?, ?, 'expense', 'Підписки', 'підписки', 'Wifi', '#5E5CE6', ?, ?)\`,
        [SUBSCRIPTIONS_ID, userId, now, now]
      );
      console.log('[created] Підписки');
    }
  }

  await db.close();
  console.log('Done.');
}

migrate().catch(e => { console.error(e); process.exit(1); });
`;

const log = (...args) => console.log('[merge]', ...args);

(async () => {
  const ssh = new NodeSSH();
  log(`Connecting to ${DEPLOY_USER}@${DEPLOY_HOST}...`);
  await ssh.connect({
    host: DEPLOY_HOST,
    username: DEPLOY_USER,
    password: DEPLOY_PASSWORD || undefined,
    privateKey: DEPLOY_PRIVATE_KEY_PATH ? readFileSync(DEPLOY_PRIVATE_KEY_PATH, 'utf8') : undefined,
  });
  log('Connected.\n');

  const result = await ssh.execCommand(
    `cd '${DEPLOY_APP_DIR}' && node --input-type=commonjs <<'EOF'\n${inlineScript}\nEOF`
  );

  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  ssh.dispose();

  if (result.code !== 0) {
    console.error('[merge] ❌ Failed with code', result.code);
    process.exit(1);
  }
  log('✅ Done.');
})();
