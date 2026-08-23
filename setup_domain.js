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

    /**
     * Формат логу без рядка запиту.
     *
     * Токен автоматизації їздить у `?token=` — інакше ярлик на iPhone не вміє,
     * там звичайний GET без заголовків. Це постійний ключ на запис, і в
     * стандартному логу він осідає відкритим текстом назавжди: `access.log`
     * читає хто завгодно з доступом до сервера, він потрапляє в бекапи й у
     * будь-який збір логів. `$uri` пише шлях без параметрів — усе, що з логу
     * справді треба, лишається.
     *
     * `log_format` живе тільки в контексті `http`, тому окремим файлом у conf.d,
     * а не в блоці server.
     */
    const nginxLogFormat = `cat << 'EOF' > /etc/nginx/conf.d/denga-log-format.conf
log_format denga_no_query '$remote_addr - $remote_user [$time_local] '
                          '"$request_method $uri $server_protocol" '
                          '$status $body_bytes_sent "$http_referer" "$http_user_agent"';
EOF`;
    await ssh.execCommand(nginxLogFormat);

    const nginxConf = `cat << 'EOF' > /etc/nginx/sites-available/default
server {
    listen 80;
    server_name ${DOMAIN};

    access_log /var/log/nginx/access.log denga_no_query;

    # Скан чека шле картинку в base64; сам застосунок ріже її на ~1 МБ.
    client_max_body_size 12m;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        # Без цього застосунок бачить усіх клієнтів як 127.0.0.1, і обмеження
        # частоти по адресі стає одним спільним відром на всіх.
        # $proxy_add_x_forwarded_for дописує справжню адресу в кінець списку, а
        # TRUST_PROXY=1 велить Express брати рівно один крок справа — тобто цей
        # останній елемент. Заголовок, підроблений клієнтом, лишається лівіше й
        # ігнорується. Разом із цим на сервері вмикається TRUST_PROXY=1.
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
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
