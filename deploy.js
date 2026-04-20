import { NodeSSH } from 'node-ssh';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.join(__dirname, '.deploy.env');
if (!existsSync(envPath)) {
  console.error('[deploy] Missing .deploy.env. Copy .deploy.env.example to .deploy.env and fill it in.');
  process.exit(1);
}
dotenv.config({ path: envPath });

const {
  DEPLOY_HOST,
  DEPLOY_USER = 'root',
  DEPLOY_PASSWORD,
  DEPLOY_PRIVATE_KEY_PATH,
  DEPLOY_APP_DIR = '/root/denga',
  DEPLOY_PM2_NAME = 'denga-app',
  GIT_REMOTE_URL,
  GIT_BRANCH = 'main',
  GITHUB_USER,
  GITHUB_TOKEN,
} = process.env;

if (!DEPLOY_HOST) throw new Error('DEPLOY_HOST is required in .deploy.env');
if (!GIT_REMOTE_URL) throw new Error('GIT_REMOTE_URL is required in .deploy.env');
if (!DEPLOY_PASSWORD && !DEPLOY_PRIVATE_KEY_PATH) {
  throw new Error('Either DEPLOY_PASSWORD or DEPLOY_PRIVATE_KEY_PATH must be set in .deploy.env');
}

const sh = (cmd, opts = {}) => {
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts });
    return out ? out.toString().trim() : '';
  } catch (e) {
    if (opts.ignoreError) return '';
    throw e;
  }
};

const log = (...args) => console.log('[deploy]', ...args);

const pushToGithub = () => {
  log('Committing local changes (if any)...');
  sh('git add -A', { ignoreError: true });
  const status = sh('git status --porcelain');
  if (status) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    sh(`git commit -m "deploy: ${stamp}"`);
    log('Created commit.');
  } else {
    log('Nothing to commit, pushing anyway.');
  }

  log(`Pushing to ${GIT_REMOTE_URL} (${GIT_BRANCH})...`);
  sh(`git push origin ${GIT_BRANCH}`, { stdio: 'inherit' });
  const sha = sh('git rev-parse HEAD');
  log(`Pushed ${sha.slice(0, 7)}.`);
  return sha;
};

const authedRemoteUrl = () => {
  if (GITHUB_USER && GITHUB_TOKEN && GIT_REMOTE_URL.startsWith('https://github.com/')) {
    return GIT_REMOTE_URL.replace(
      'https://github.com/',
      `https://${encodeURIComponent(GITHUB_USER)}:${encodeURIComponent(GITHUB_TOKEN)}@github.com/`
    );
  }
  return GIT_REMOTE_URL;
};

const escape = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;

const remoteDeploy = async (expectedSha) => {
  const ssh = new NodeSSH();
  log(`Connecting to ${DEPLOY_USER}@${DEPLOY_HOST}...`);
  await ssh.connect({
    host: DEPLOY_HOST,
    username: DEPLOY_USER,
    password: DEPLOY_PASSWORD || undefined,
    privateKey: DEPLOY_PRIVATE_KEY_PATH
      ? readFileSync(DEPLOY_PRIVATE_KEY_PATH, 'utf8')
      : undefined,
  });
  log('Connected.');

  const remoteUrl = authedRemoteUrl();
  const appDir = DEPLOY_APP_DIR;

  const script = [
    'set -e',
    `APP_DIR=${escape(appDir)}`,
    `REPO_URL=${escape(remoteUrl)}`,
    `BRANCH=${escape(GIT_BRANCH)}`,
    `PM2_NAME=${escape(DEPLOY_PM2_NAME)}`,
    'mkdir -p "$APP_DIR"',
    'cd "$APP_DIR"',
    'if [ ! -d .git ]; then',
    '  echo "[server] $APP_DIR is not a git repo yet, bootstrapping..."',
    '  if [ -f .env ]; then cp -f .env /tmp/denga.env.bak; fi',
    '  if [ -f database.sqlite ]; then cp -f database.sqlite /tmp/denga.database.sqlite.bak; fi',
    '  cd /',
    '  rm -rf "$APP_DIR"',
    '  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"',
    '  cd "$APP_DIR"',
    '  if [ -f /tmp/denga.env.bak ]; then cp -f /tmp/denga.env.bak .env; fi',
    '  if [ -f /tmp/denga.database.sqlite.bak ]; then cp -f /tmp/denga.database.sqlite.bak database.sqlite; fi',
    'else',
    '  echo "[server] Pulling latest..."',
    '  git remote set-url origin "$REPO_URL"',
    '  git fetch --prune origin "$BRANCH"',
    '  git reset --hard "origin/$BRANCH"',
    'fi',
    'echo "[server] HEAD: $(git rev-parse HEAD)"',
    'echo "[server] npm install..."',
    'npm install --no-audit --no-fund',
    'echo "[server] npm run build..."',
    'npm run build',
    'echo "[server] pm2 restart $PM2_NAME..."',
    'pm2 restart "$PM2_NAME" --update-env || pm2 start npm --name "$PM2_NAME" -- run start',
    'echo "[server] Done."',
  ].join('\n');

  log('Running remote deploy script...');
  const result = await ssh.execCommand(`bash -s <<'DENGA_DEPLOY'\n${script}\nDENGA_DEPLOY`);
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);

  ssh.dispose();

  if (result.code !== 0) {
    throw new Error(`Remote deploy failed with code ${result.code}`);
  }

  log(`Deploy finished. Expected HEAD: ${expectedSha.slice(0, 7)}`);
};

(async () => {
  try {
    const sha = pushToGithub();
    await remoteDeploy(sha);
    log('✅ Deployment succeeded.');
  } catch (err) {
    console.error('[deploy] ❌ Deployment failed:', err.message || err);
    process.exit(1);
  }
})();
