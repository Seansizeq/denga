import { NodeSSH } from 'node-ssh';
import { readFileSync, existsSync } from 'fs';
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

if (!DEPLOY_HOST) throw new Error('DEPLOY_HOST required in .deploy.env');

// English/Russian name → built-in category ID (duplicates to remove)
const BUILTIN_MAP = {
  'other expense': 'other_expense',
  'other expenses': 'other_expense',
  'uncategorised expense': 'other_expense',
  'uncategorized expense': 'other_expense',
  'uncategorised': 'other_expense',
  'uncategorized': 'other_expense',
  'other': 'other_expense',
  'misc': 'other_expense',
  'miscellaneous': 'other_expense',
  'другое': 'other_expense',
  'прочее': 'other_expense',
  'інше': 'other_expense',
};

// English/Russian name → Ukrainian name
const RENAME_MAP = {
  'clothing': 'Одяг',
  'digital': 'Цифрові',
  'gifts': 'Подарунки',
  'gift': 'Подарунки',
  'shop': 'Покупки',
  'shopping': 'Покупки',
  'games': 'Ігри',
  'game': 'Ігри',
  'icloud': 'iCloud',
  'education': 'Освіта',
  'mobile': 'Мобільний',
  'charity': 'Благодійність',
  'перевод': 'Переказ',
};

const inlineScript = `
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.resolve('${DEPLOY_APP_DIR}/database.sqlite');

const BUILTIN_MAP = ${JSON.stringify(BUILTIN_MAP)};
const RENAME_MAP = ${JSON.stringify(RENAME_MAP)};

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

function buildCustomId(name, icon, color) {
  return 'custom:' + encodeURIComponent(name.trim()) + '|' + icon + '|' + encodeURIComponent(color);
}

async function migrate() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.run('PRAGMA journal_mode = WAL');

  // --- transactions ---
  const txRows = await db.all(
    "SELECT DISTINCT categoryId FROM transactions WHERE categoryId LIKE 'custom:%'"
  );
  console.log('Distinct custom categoryIds in transactions:', txRows.length);

  for (const { categoryId } of txRows) {
    const parsed = parseCustom(categoryId);
    if (!parsed) continue;
    const key = parsed.name.toLowerCase().trim();

    const builtIn = BUILTIN_MAP[key];
    if (builtIn) {
      const { changes } = await db.run(
        'UPDATE transactions SET categoryId = ? WHERE categoryId = ?',
        [builtIn, categoryId]
      );
      console.log('[dup->builtin]', parsed.name, '->', builtIn, '(' + changes + ' tx)');
      continue;
    }

    const newName = RENAME_MAP[key];
    if (newName && newName !== parsed.name) {
      const newId = buildCustomId(newName, parsed.icon, parsed.color);
      const { changes } = await db.run(
        'UPDATE transactions SET categoryId = ? WHERE categoryId = ?',
        [newId, categoryId]
      );
      console.log('[rename]', parsed.name, '->', newName, '(' + changes + ' tx)');
      continue;
    }

    console.log('[keep]', parsed.name);
  }

  // --- custom_categories table ---
  const catRows = await db.all(
    "SELECT id, name, icon, color, type, user_id FROM custom_categories"
  );
  console.log('\\nRows in custom_categories table:', catRows.length);

  for (const row of catRows) {
    const key = row.name.toLowerCase().trim();

    const builtIn = BUILTIN_MAP[key];
    if (builtIn) {
      await db.run('DELETE FROM custom_categories WHERE id = ?', [row.id]);
      console.log('[dup->delete]', row.name);
      continue;
    }

    const newName = RENAME_MAP[key];
    if (newName && newName !== row.name) {
      const newId = buildCustomId(newName, row.icon, row.color);
      await db.run(
        'UPDATE custom_categories SET id = ?, name = ?, normalized_name = ? WHERE id = ?',
        [newId, newName, newName.trim().toLowerCase(), row.id]
      );
      // Update transactions that reference the old id
      await db.run(
        'UPDATE transactions SET categoryId = ? WHERE categoryId = ?',
        [newId, row.id]
      );
      console.log('[rename table]', row.name, '->', newName);
      continue;
    }

    console.log('[keep table]', row.name);
  }

  // --- subscriptions table (also has categoryId) ---
  const subRows = await db.all(
    "SELECT id, categoryId FROM subscriptions WHERE categoryId LIKE 'custom:%'"
  );
  console.log('\\nCustom categories in subscriptions:', subRows.length);

  for (const { id, categoryId } of subRows) {
    const parsed = parseCustom(categoryId);
    if (!parsed) continue;
    const key = parsed.name.toLowerCase().trim();

    const builtIn = BUILTIN_MAP[key];
    if (builtIn) {
      await db.run('UPDATE subscriptions SET categoryId = ? WHERE id = ?', [builtIn, id]);
      console.log('[sub dup->builtin]', parsed.name, '->', builtIn);
      continue;
    }

    const newName = RENAME_MAP[key];
    if (newName && newName !== parsed.name) {
      const newId = buildCustomId(newName, parsed.icon, parsed.color);
      await db.run('UPDATE subscriptions SET categoryId = ? WHERE id = ?', [newId, id]);
      console.log('[sub rename]', parsed.name, '->', newName);
    }
  }

  await db.close();
  console.log('\\nMigration complete.');
}

migrate().catch(e => { console.error(e); process.exit(1); });
`;

const log = (...args) => console.log('[migrate]', ...args);

(async () => {
  const ssh = new NodeSSH();
  log(`Connecting to ${DEPLOY_USER}@${DEPLOY_HOST}...`);
  await ssh.connect({
    host: DEPLOY_HOST,
    username: DEPLOY_USER,
    password: DEPLOY_PASSWORD || undefined,
    privateKey: DEPLOY_PRIVATE_KEY_PATH ? readFileSync(DEPLOY_PRIVATE_KEY_PATH, 'utf8') : undefined,
  });
  log('Connected. Running migration...\n');

  const result = await ssh.execCommand(
    `cd '${DEPLOY_APP_DIR}' && node --input-type=commonjs <<'MIGRATION_EOF'\n${inlineScript}\nMIGRATION_EOF`
  );

  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  ssh.dispose();

  if (result.code !== 0) {
    console.error('[migrate] ❌ Failed with code', result.code);
    process.exit(1);
  }
  log('✅ Done.');
})();
