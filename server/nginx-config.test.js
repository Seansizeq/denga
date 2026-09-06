import { describe, expect, it } from 'vitest';
import {
  API_RATE_LIMIT,
  GZIP_TYPES,
  buildProxyHeadersConf,
  buildServerConf,
  buildTuningConf,
  writeRemoteFile,
} from './nginx-config.js';

describe('buildTuningConf', () => {
  const conf = buildTuningConf();

  it('вмикає gzip для пропрокшеного вмісту', () => {
    // Головна пастка: за proxy_pass типове значення — off, і `gzip on` без
    // цього рядка не стискає нічого. Конфіг при цьому виглядає правильним.
    expect(conf).toMatch(/^gzip_proxied any;$/m);
    expect(conf).toMatch(/^gzip on;$/m);
  });

  it('ставить Vary, щоб кеші не віддали стиснуте несумісному клієнту', () => {
    expect(conf).toMatch(/^gzip_vary on;$/m);
  });

  it('не згадує text/html — nginx стискає його завжди й лається на дубль', () => {
    expect(GZIP_TYPES).not.toContain('text/html');
    expect(conf).not.toMatch(/gzip_types[^;]*text\/html/);
  });

  it('стискає відповіді API — це основний трафік застосунку', () => {
    expect(GZIP_TYPES).toContain('application/json');
  });

  it('оголошує зону лімітів, але не вмикає саме обмеження', () => {
    // `limit_req_zone` живе в http-контексті й сам по собі нічого не обмежує,
    // тому цей файл лишається чисто додатковою зміною.
    expect(conf).toMatch(/limit_req_zone \$binary_remote_addr zone=denga_api:/);
    expect(conf).not.toMatch(/^\s*limit_req\s+zone=/m);
  });

  it('віддає 429, а не 503 — інакше ліміт виглядає як падіння сервера', () => {
    expect(conf).toMatch(/^limit_req_status 429;$/m);
  });
});

describe('buildServerConf', () => {
  const conf = buildServerConf({ domain: 'denga.vibelearn.site' });

  it('лишає формат логу без рядка запиту — у ньому їде токен автоматизації', () => {
    expect(conf).toMatch(/access_log .*denga_no_query;/);
  });

  it('тримає межу тіла для скану чека', () => {
    expect(conf).toMatch(/client_max_body_size 12m;/);
  });

  it('вмикає обмеження лише на /api', () => {
    const apiBlock = conf.slice(conf.indexOf('location /api/'), conf.indexOf('location / {'));
    expect(apiBlock).toMatch(new RegExp(`limit_req zone=denga_api burst=${API_RATE_LIMIT.burst} nodelay;`));
    const rootBlock = conf.slice(conf.indexOf('location / {'));
    expect(rootBlock).not.toMatch(/limit_req /);
  });

  it('кожна локація, що проксіює, підключає спільні заголовки', () => {
    // Скопійовані вручну заголовки колись розʼїхалися б, а від X-Forwarded-For
    // залежить, чи бачить застосунок справжню адресу клієнта. Тому звіряємо не
    // число, а відповідність: скільки proxy_pass — стільки й include.
    const proxied = conf.match(/proxy_pass /g) ?? [];
    const includes = conf.match(/include \/etc\/nginx\/conf\.d\/denga-proxy-headers\.inc;/g) ?? [];
    expect(includes).toHaveLength(proxied.length);
    expect(proxied.length).toBeGreaterThanOrEqual(3);
  });

  it('перевірка стану не пише в лог і не має ліміту', () => {
    const block = conf.slice(conf.indexOf('location = /healthz'), conf.indexOf('location = /metrics'));
    expect(block).toMatch(/access_log off;/);
    expect(block).not.toMatch(/limit_req /);
  });

  it('метрики назовні не віддаються взагалі', () => {
    // Вони й так за токеном, але сам факт їхньої наявності стороннім знати не
    // потрібно.
    const block = conf.slice(conf.indexOf('location = /metrics'), conf.indexOf('location /api/'));
    expect(block).toMatch(/return 404;/);
    expect(block).not.toMatch(/proxy_pass/);
  });

  it('відмовляється зібрати конфіг з підозрілим доменом', () => {
    expect(() => buildServerConf({ domain: 'example.com; rm -rf /' })).toThrow(/некоректний домен/);
    expect(() => buildServerConf({ domain: '' })).toThrow(/некоректний домен/);
  });
});

describe('buildProxyHeadersConf', () => {
  it('передає справжню адресу клієнта', () => {
    const conf = buildProxyHeadersConf();
    expect(conf).toMatch(/proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
    expect(conf).toMatch(/proxy_set_header X-Real-IP \$remote_addr;/);
  });
});

describe('writeRemoteFile', () => {
  it('не ламається на лапках і доларах усередині конфігу', () => {
    const cmd = writeRemoteFile('/etc/nginx/conf.d/x.conf', buildTuningConf());
    // Heredoc із лапками навколо мітки: жодної підстановки змінних оболонкою.
    expect(cmd).toMatch(/^cat << 'DENGA_EOF' > \/etc\/nginx\/conf\.d\/x\.conf\n/);
    expect(cmd.trimEnd().endsWith('DENGA_EOF')).toBe(true);
    expect(cmd).toContain('$binary_remote_addr');
  });
});
