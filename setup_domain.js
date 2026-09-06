import { NodeSSH } from 'node-ssh';
import { readFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildLogFormatConf,
  buildProxyHeadersConf,
  buildServerConf,
  buildTuningConf,
  writeRemoteFile,
} from './server/nginx-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.deploy.env');
if (!existsSync(envPath)) {
  console.error('[setup-domain] Missing .deploy.env. Copy .deploy.env.example to .deploy.env and fill it in.');
  process.exit(1);
}
dotenv.config({ path: envPath });

const DOMAIN = process.env.DEPLOY_DOMAIN || 'denga.vibelearn.site';
const CERT_EMAIL = process.env.CERTBOT_EMAIL || `dummy@${DOMAIN.split('.').slice(-2).join('.')}`;
const {
  DEPLOY_HOST,
  DEPLOY_USER = 'root',
  DEPLOY_PASSWORD,
  DEPLOY_PRIVATE_KEY_PATH,
} = process.env;

if (!DEPLOY_HOST) throw new Error('DEPLOY_HOST is required in .deploy.env');

const ssh = new NodeSSH();

async function setupDomain() {
  try {
    console.log(`Connecting to ${DEPLOY_USER}@${DEPLOY_HOST}...`);
    await ssh.connect({
      host: DEPLOY_HOST,
      username: DEPLOY_USER,
      password: DEPLOY_PASSWORD || undefined,
      privateKey: DEPLOY_PRIVATE_KEY_PATH
        ? readFileSync(DEPLOY_PRIVATE_KEY_PATH, 'utf8')
        : undefined,
    });
    console.log('Connected!');

    console.log(`Configuring Nginx for ${DOMAIN}...`);

    // Конфіг живе в `server/nginx-config.js` — там його перевіряє тест, і там
    // же він поділений на частину, яку можна застосувати без переписування
    // блоку server (див. scripts/apply-nginx-tuning.js).
    for (const [file, contents] of [
      ['/etc/nginx/conf.d/denga-log-format.conf', buildLogFormatConf()],
      ['/etc/nginx/conf.d/denga-tuning.conf', buildTuningConf()],
      ['/etc/nginx/conf.d/denga-proxy-headers.inc', buildProxyHeadersConf()],
      ['/etc/nginx/sites-available/default', buildServerConf({ domain: DOMAIN })],
    ]) {
      const res = await ssh.execCommand(writeRemoteFile(file, contents));
      if (res.code !== 0) throw new Error(`не вдалося записати ${file}: ${res.stderr || res.stdout}`);
    }
    await ssh.execCommand('ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/');

    // Перевіряємо ДО перезапуску: інакше зламаний конфіг лишає сайт лежати.
    const nginxTest = await ssh.execCommand('nginx -t');
    if (nginxTest.code !== 0) {
      console.error(nginxTest.stderr || nginxTest.stdout);
      throw new Error('nginx відхилив конфіг — перезапуск скасовано');
    }
    await ssh.execCommand('systemctl restart nginx');

    console.log('Running Certbot to get SSL...');
    const certbotRes = await ssh.execCommand(
      `certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m ${CERT_EMAIL}`
    );
    console.log(certbotRes.stdout, certbotRes.stderr);

    console.log('Done Setup!');
  } catch (error) {
    console.error('Check failed:', error);
  } finally {
    ssh.dispose();
  }
}

setupDomain();
