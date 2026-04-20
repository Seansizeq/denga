import { NodeSSH } from 'node-ssh';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.deploy.env');
if (!existsSync(envPath)) {
  console.error('[zip-deploy] .deploy.env not found');
  process.exit(1);
}
dotenv.config({ path: envPath });

const {
  DEPLOY_HOST,
  DEPLOY_USER = 'root',
  DEPLOY_PASSWORD,
  DEPLOY_APP_DIR = '/root/denga',
  DEPLOY_PM2_NAME = 'denga-app',
} = process.env;

const ZIP_PATH = path.join(__dirname, 'denga.zip');
if (!existsSync(ZIP_PATH)) {
  console.error('[zip-deploy] denga.zip not found; build & pack first');
  process.exit(1);
}

const ssh = new NodeSSH();

const run = async (cmd, opts = {}) => {
  console.log(`$ ${cmd}`);
  const r = await ssh.execCommand(cmd, opts);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  if (r.code !== 0 && !opts.allowFail) {
    throw new Error(`Command failed (${r.code}): ${cmd}`);
  }
  return r;
};

(async () => {
  try {
    console.log(`[zip-deploy] Connecting to ${DEPLOY_USER}@${DEPLOY_HOST}...`);
    await ssh.connect({
      host: DEPLOY_HOST,
      username: DEPLOY_USER,
      password: DEPLOY_PASSWORD,
    });
    console.log('[zip-deploy] Connected.');

    console.log('[zip-deploy] Uploading denga.zip...');
    await ssh.putFile(ZIP_PATH, '/root/denga.zip');

    console.log('[zip-deploy] Wiping src/ & public/ and unpacking...');
    await run(`mkdir -p ${DEPLOY_APP_DIR}`);
    await run(`rm -rf ${DEPLOY_APP_DIR}/src ${DEPLOY_APP_DIR}/public`);
    await run(`unzip -o /root/denga.zip -d ${DEPLOY_APP_DIR}`);

    console.log('[zip-deploy] npm install & build...');
    await run('npm install --no-audit --no-fund', { cwd: DEPLOY_APP_DIR });
    await run('npm run build', { cwd: DEPLOY_APP_DIR });

    console.log('[zip-deploy] Restarting pm2...');
    await run(
      `pm2 restart ${DEPLOY_PM2_NAME} --update-env || pm2 start npm --name ${DEPLOY_PM2_NAME} -- run start`,
      { cwd: DEPLOY_APP_DIR, allowFail: true }
    );

    console.log('[zip-deploy] HEAD info on server:');
    await run(`cd ${DEPLOY_APP_DIR} && ls -la dist/assets | head -n 5`, { allowFail: true });

    console.log('[zip-deploy] Done.');
  } catch (err) {
    console.error('[zip-deploy] Failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    ssh.dispose();
  }
})();
