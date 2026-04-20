import { NodeSSH } from 'node-ssh';
import { readFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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
    const nginxConf = `cat << 'EOF' > /etc/nginx/sites-available/default
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF`;
    await ssh.execCommand(nginxConf);
    await ssh.execCommand('ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/');
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
