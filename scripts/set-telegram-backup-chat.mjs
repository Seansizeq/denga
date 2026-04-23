/**
 * Прописує на проді TELEGRAM_BACKUP_CHAT_ID у /root/denga/.env і рестартує pm2.
 * Потрібен `.deploy.env` (той самий, що для deploy).
 *
 * Використання: node scripts/set-telegram-backup-chat.mjs <chat_id>
 */
import { readFileSync, existsSync } from 'fs';
import { NodeSSH } from 'node-ssh';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.deploy.env') });

const chatId = process.argv[2];
if (!chatId) {
  console.error('Usage: node scripts/set-telegram-backup-chat.mjs <telegram_chat_id>');
  process.exit(1);
}
if (!/^\d+$/.test(chatId)) {
  console.error('Chat id must be digits only');
  process.exit(1);
}

const { DEPLOY_HOST, DEPLOY_USER = 'root', DEPLOY_PASSWORD, DEPLOY_PRIVATE_KEY_PATH } = process.env;

if (!DEPLOY_HOST) {
  console.error('Missing DEPLOY_HOST in .deploy.env');
  process.exit(1);
}
if (!DEPLOY_PASSWORD && !DEPLOY_PRIVATE_KEY_PATH) {
  console.error('Either DEPLOY_PASSWORD or DEPLOY_PRIVATE_KEY_PATH must be set in .deploy.env');
  process.exit(1);
}

const ssh = new NodeSSH();
await ssh.connect({
  host: DEPLOY_HOST,
  username: DEPLOY_USER,
  password: DEPLOY_PASSWORD || undefined,
  privateKey: DEPLOY_PRIVATE_KEY_PATH && existsSync(DEPLOY_PRIVATE_KEY_PATH)
    ? readFileSync(DEPLOY_PRIVATE_KEY_PATH, 'utf8')
    : undefined,
});

const remote = `
set -e
cd /root/denga
if [ -f .env ]; then
  if grep -q '^TELEGRAM_BACKUP_CHAT_ID=' .env; then
    sed -i 's/^TELEGRAM_BACKUP_CHAT_ID=.*/TELEGRAM_BACKUP_CHAT_ID=${chatId}/' .env
  else
    echo "TELEGRAM_BACKUP_CHAT_ID=${chatId}" >> .env
  fi
else
  echo "TELEGRAM_BACKUP_CHAT_ID=${chatId}" > .env
fi
if ! grep -q '^BACKUP_DAILY_HOUR=' .env; then
  echo 'BACKUP_DAILY_HOUR=6' >> .env
fi
echo '--- backup-related env lines ---'
grep -E 'BACKUP|TELEGRAM_BACKUP' .env || true
pm2 restart denga-app --update-env
pm2 show denga-app | head -n 8
`.trim();

const r = await ssh.execCommand(remote);
console.log(r.stdout);
if (r.stderr) console.error(r.stderr);
ssh.dispose();
process.exit(r.code ?? 0);
