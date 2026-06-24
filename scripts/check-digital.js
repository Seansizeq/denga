import { NodeSSH } from 'node-ssh';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.deploy.env') });

const { DEPLOY_HOST, DEPLOY_USER = 'root', DEPLOY_PASSWORD, DEPLOY_PRIVATE_KEY_PATH, DEPLOY_APP_DIR = '/root/denga' } = process.env;

const inline = `
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
async function run() {
  const db = await open({ filename: '${DEPLOY_APP_DIR}/database.sqlite', driver: sqlite3.Database });
  const rows = await db.all(
    "SELECT amount, currency, note, date FROM transactions WHERE categoryId LIKE 'custom:%' AND categoryId LIKE '%' || ? || '%' ORDER BY date DESC",
    [encodeURIComponent('Цифрові')]
  );
  for (const r of rows) console.log(r.date.slice(0,10), r.amount, r.currency, r.note || '(без нотатки)');
  await db.close();
}
run().catch(console.error);
`;

const ssh = new NodeSSH();
await ssh.connect({ host: DEPLOY_HOST, username: DEPLOY_USER, password: DEPLOY_PASSWORD || undefined, privateKey: DEPLOY_PRIVATE_KEY_PATH ? readFileSync(DEPLOY_PRIVATE_KEY_PATH, 'utf8') : undefined });
const r = await ssh.execCommand(`cd '${DEPLOY_APP_DIR}' && node --input-type=commonjs <<'EOF'\n${inline}\nEOF`);
if (r.stdout) console.log(r.stdout);
if (r.stderr) console.error(r.stderr);
ssh.dispose();
