/**
 * Печатает публичный SSH-ключ с продакшн-сервера — его нужно добавить в
 * GitHub → Repo → Settings → Deploy keys (read-only).
 *
 * Требуется `.deploy.env` (см. `.deploy.env.example`).
 */
import { readFileSync, existsSync } from 'fs';
import { NodeSSH } from 'node-ssh';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.deploy.env') });

const { DEPLOY_HOST, DEPLOY_USER = 'root', DEPLOY_PASSWORD, DEPLOY_PRIVATE_KEY_PATH } = process.env;

if (!DEPLOY_HOST) {
  console.error('Missing DEPLOY_HOST in .deploy.env');
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

const r = await ssh.execCommand('cat /root/.ssh/denga_deploy.pub 2>/dev/null || echo MISSING');
console.log(r.stdout.trim());
if (r.stdout.includes('MISSING')) {
  console.error('Ключ не найден. Используйте GITHUB_TOKEN в .deploy.env или сгенерируйте ключ на сервере.');
}
ssh.dispose();
