/**
 * Навантаження профілем справжнього клієнта.
 *
 * Не «скільки запитів витримає сервер» узагалі, а «скільки одночасно
 * відкритих застосунків він тягне». Це різні числа: відкритий екран робить
 * один запит `/api/sync` на пʼять секунд, і майже завжди отримує порожній 304.
 * Саме цей профіль і відтворюється тут.
 *
 *   node scripts/loadtest.mjs --clients 300 --seconds 60
 *   node scripts/loadtest.mjs --url http://127.0.0.1:3001 --clients 50
 *
 * Сервер має бути піднятий з обходом авторизації, інакше кожен запит впреться
 * в перевірку підпису:
 *
 *   NODE_ENV=development ALLOW_DEV_AUTH_BYPASS=1 DATABASE_PATH=/tmp/lt.sqlite \
 *     API_RATE_LIMIT_PER_MIN=1000000 USER_RATE_LIMIT_PER_MIN=1000000 \
 *     PORT=3001 node server/api.js
 *
 * Ліміти навмисно піднімаються: інакше тест міряє не сервер, а власну заслінку
 * від флуду — вона спрацює першою й покаже 429 замість справжньої стелі.
 */

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};

const BASE = String(arg('url', 'http://127.0.0.1:3001')).replace(/\/$/, '');
const CLIENTS = Math.max(1, Number(arg('clients', 100)));
const SECONDS = Math.max(1, Number(arg('seconds', 30)));
/** Той самий такт, що й у застосунку (`src/utils/backoff.ts`). */
const POLL_MS = Number(arg('poll', 5000));

const HEADERS = { 'x-telegram-init-data': 'dev-bypass' };

const stats = {
  requests: 0,
  notModified: 0,
  ok: 0,
  rateLimited: 0,
  errors: 0,
  bytes: 0,
  /** Затримки — у список: тут їх десятки тисяч, а не мільйони, і потрібні перцентилі. */
  latencies: [],
};

const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

/** Один «відкритий екран»: власний ETag, власний такт. */
const runClient = async (deadline) => {
  let etag = null;
  while (Date.now() < deadline) {
    const startedAt = Date.now();
    try {
      const res = await fetch(`${BASE}/api/sync`, {
        headers: etag ? { ...HEADERS, 'If-None-Match': etag } : HEADERS,
      });
      const body = await res.arrayBuffer();
      stats.requests += 1;
      stats.bytes += body.byteLength;
      stats.latencies.push(Date.now() - startedAt);
      if (res.status === 304) stats.notModified += 1;
      else if (res.status === 429) stats.rateLimited += 1;
      else if (res.ok) {
        stats.ok += 1;
        const next = res.headers.get('etag');
        if (next) etag = next;
      } else stats.errors += 1;
    } catch {
      stats.requests += 1;
      stats.errors += 1;
    }
    // Розкид старту, щоб усі клієнти не били в одну мить — так само, як це
    // робить справжній застосунок після відступу.
    const wait = POLL_MS - (Date.now() - startedAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
};

const probe = await fetch(`${BASE}/healthz`).catch(() => null);
if (!probe?.ok) {
  console.error(`[loadtest] ${BASE}/healthz не відповідає — сервер піднято?`);
  process.exit(1);
}

console.log(`[loadtest] ${CLIENTS} клієнтів × ${SECONDS} с, такт ${POLL_MS} мс → ${BASE}`);
const startedAt = Date.now();
const deadline = startedAt + SECONDS * 1000;
await Promise.all(
  Array.from({ length: CLIENTS }, (_, i) =>
    // Стартуємо не всіх одночасно: перша хвиля інакше створює пік, якого в
    // житті не буває.
    new Promise((r) => setTimeout(r, (i / CLIENTS) * POLL_MS)).then(() => runClient(deadline)),
  ),
);

const elapsed = (Date.now() - startedAt) / 1000;
const sorted = stats.latencies.sort((a, b) => a - b);
const pct = (n) => ((n / Math.max(1, stats.requests)) * 100).toFixed(1);

console.log('');
console.log(`тривалість        : ${elapsed.toFixed(1)} с`);
console.log(`запитів           : ${stats.requests}  (${(stats.requests / elapsed).toFixed(1)}/с)`);
console.log(`  304 без змін    : ${stats.notModified}  (${pct(stats.notModified)}%)`);
console.log(`  200 з даними    : ${stats.ok}  (${pct(stats.ok)}%)`);
console.log(`  429 ліміт       : ${stats.rateLimited}  (${pct(stats.rateLimited)}%)`);
console.log(`  помилок         : ${stats.errors}  (${pct(stats.errors)}%)`);
console.log(`трафік            : ${(stats.bytes / 1024 / 1024).toFixed(2)} МБ  (${(stats.bytes / elapsed / 1024).toFixed(1)} КБ/с)`);
console.log(`затримка p50/p95/p99: ${percentile(sorted, 50)} / ${percentile(sorted, 95)} / ${percentile(sorted, 99)} мс`);

// Критерії з плану: без 5xx, без хибних 429, p95 нижче 300 мс.
const verdict = stats.errors === 0 && stats.rateLimited === 0 && percentile(sorted, 95) < 300;
console.log('');
console.log(verdict ? '>>> У МЕЖАХ ПРИЙНЯТНОГО' : '>>> ПОГАНО: є помилки, 429 або p95 понад 300 мс');
process.exit(verdict ? 0 : 1);
