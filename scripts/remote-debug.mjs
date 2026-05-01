import dotenv from 'dotenv';
import { NodeSSH } from 'node-ssh';

dotenv.config({ path: '.deploy.env' });

const ssh = new NodeSSH();
await ssh.connect({
  host: process.env.DEPLOY_HOST,
  username: process.env.DEPLOY_USER,
  password: process.env.DEPLOY_PASSWORD,
});

const cmd = process.argv.slice(2).join(' ') || 'cd /root/denga && git rev-parse HEAD && pm2 status';
const r = await ssh.execCommand(cmd);
process.stdout.write(r.stdout + '\n');
if (r.stderr) process.stderr.write('--STDERR--\n' + r.stderr + '\n');
ssh.dispose();
