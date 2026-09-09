// Google Gemini provider for smart transaction parsing.
//
// Several models are tried in order: when one hits its rate/daily limit
// (HTTP 429) the model is put on a cooldown and the next model with free quota
// is used. Configure with GEMINI_MODELS (comma-separated) or GEMINI_MODEL
// (preferred primary, prepended to the default chain).

import {
  buildResponseSchema,
  buildSystemPrompt,
  normalizeResult,
  toGeminiSchema,
} from './smart-transaction-shared.js';

// Read the key lazily at call time, NOT at module load. ESM imports are
// evaluated before the importing module's body runs, so a top-level
// `process.env.GEMINI_API_KEY` would be read before dotenv.config() populates
// it — leaving the feature permanently disabled in production.
const getApiKey = () => process.env.GEMINI_API_KEY;

// Default fallback chain, ordered by available free-tier quota (most headroom
// first), then by quality. Lite models are more than enough for this task.
//
// Кожна назва тут звірена зі списком `models.list` бойового ключа: модель, якої
// в нього немає, — не безневинний зайвий рядок. Виклик до неї повертає 404,
// провайдер вважає це збоєм, ставить її на хвилину в холодну й іде далі, тобто
// кожен розбір платить зайвим круговим запитом. Саме так тут довго жили
// `gemini-2.0-flash` і `gemini-2.0-flash-lite` — Google їх прибрав.
//
// Останній рядок — рухомий псевдонім, і він тут навмисно: коли Google винесе
// чергове покоління, решта ланцюга помре мовчки, а він лишиться робочим.
const DEFAULT_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-flash-lite-latest',
];

// Per-model cooldown (ms timestamp until which the model is skipped).
const cooldownUntil = new Map();

const endpointFor = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export const isGeminiEnabled = () => Boolean(getApiKey());

const resolveModels = () => {
  const explicit = String(process.env.GEMINI_MODELS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const primary = String(process.env.GEMINI_MODEL || '').trim();
  const base = explicit.length ? explicit : DEFAULT_MODELS;
  const ordered = [];
  if (primary) ordered.push(primary);
  for (const m of base) if (!ordered.includes(m)) ordered.push(m);
  return ordered;
};

/**
 * Google каже «429» і про хвилинний сплеск, і про порожній рахунок — але це
 * різні події, і поводитись із ними однаково дорого.
 *
 * `keyWide` про те, що межу вичерпано на **ключі**, а не на моделі. Тоді обхід
 * ланцюга безглуздий: решта моделей відповість тим самим, тільки п'ятьма
 * зайвими запитами й затримкою на кожному розборі. Саме так виглядає вичерпаний
 * передплачений баланс: «Your prepayment credits are depleted».
 *
 * @returns {{ cooldownMs: number, keyWide: boolean, message: string }}
 */
const classifyRateLimit = (errBody) => {
  const message = String(errBody?.error?.message || '');
  if (/prepayment credits|credits are depleted|billing/i.test(message)) {
    return { cooldownMs: 30 * 60 * 1000, keyWide: true, message };
  }
  if (/per ?day|requests per day|RPD|FreeTier.*Day/i.test(message)) {
    return { cooldownMs: 30 * 60 * 1000, keyWide: false, message };
  }
  const retry = errBody?.error?.details?.find((d) => String(d?.['@type'] || '').includes('RetryInfo'))?.retryDelay;
  const secs = retry ? parseInt(retry, 10) : NaN;
  if (Number.isFinite(secs)) {
    return { cooldownMs: Math.max(secs * 1000, 30 * 1000), keyWide: false, message };
  }
  return { cooldownMs: 60 * 1000, keyWide: false, message };
};

// Call one model. Returns a discriminated outcome so the caller can decide
// whether to fall back to the next model.
//
// `reached` каже, чи Google узагалі відповів. Це не те саме, що успіх: 429 і
// 500 — теж відповіді, і вони вже коштували запиту з денної квоти ключа. Хибним
// воно буває рівно тоді, коли запит нікуди не доїхав.
const callGeminiModel = async (model, body, apiKey) => {
  let res;
  try {
    res = await fetch(`${endpointFor(model)}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.warn(`[smart-transaction] ${model} request failed:`, err?.message || err);
    return { type: 'error', cooldownMs: 60 * 1000, reached: false };
  }

  if (res.status === 429) {
    let errBody = null;
    try {
      errBody = await res.json();
    } catch {
      // ignore
    }
    const { cooldownMs, keyWide, message } = classifyRateLimit(errBody);
    console.warn(
      `[smart-transaction] ${model} rate-limited (429), cooldown ${Math.round(cooldownMs / 1000)}s` +
        // Причину видно лише тут: «скінчились гроші на ключі» й «забагато
        // запитів за хвилину» — це те саме 429, але лікуються по-різному.
        (keyWide ? ` — ключ вичерпано: ${message.trim()}` : ''),
    );
    return { type: 'cooldown', cooldownMs, keyWide, reached: true };
  }
  if (res.status === 503) {
    return { type: 'cooldown', cooldownMs: 20 * 1000, reached: true };
  }
  if (!res.ok) {
    console.warn(`[smart-transaction] ${model} HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    return { type: 'error', cooldownMs: 60 * 1000, reached: true };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { type: 'error', cooldownMs: 60 * 1000, reached: true };
  }
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) return { type: 'error', cooldownMs: 60 * 1000, reached: true };
  try {
    return { type: 'ok', parsed: JSON.parse(raw), reached: true };
  } catch {
    console.warn(`[smart-transaction] ${model} could not parse model JSON:`, raw);
    return { type: 'error', cooldownMs: 60 * 1000, reached: true };
  }
};

/**
 * Спроба розбору з ознакою «чи вдалося достукатися».
 *
 * @returns {Promise<{ result: object|null, reached: boolean }>} `reached` — Google
 * відповів хоч однією з моделей (будь-яким статусом), тобто запит із квоти ключа
 * уже витрачено. Хибне значення означає, що назовні не пішло нічого.
 */
export async function attemptWithGemini({ text, categories, accounts = [], defaultCurrency = 'UAH', today }) {
  const apiKey = getApiKey();
  if (!apiKey) return { result: null, reached: false };

  const body = {
    systemInstruction: {
      parts: [{ text: buildSystemPrompt({ categories, accounts, defaultCurrency, today }) }],
    },
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: toGeminiSchema(buildResponseSchema(categories.map((c) => c.id))),
    },
  };

  const models = resolveModels();
  const now = Date.now();
  // Prefer models not on cooldown; if every model is cooling down, try them all
  // anyway (better to make one likely-failing call than to give up silently).
  let candidates = models.filter((m) => (cooldownUntil.get(m) ?? 0) <= now);
  if (candidates.length === 0) candidates = models;

  let reached = false;
  for (const model of candidates) {
    const outcome = await callGeminiModel(model, body, apiKey);
    reached = reached || outcome.reached === true;
    if (outcome.type === 'ok') {
      cooldownUntil.delete(model);
      return {
        result: normalizeResult(outcome.parsed, { categories, accounts, defaultCurrency, today }),
        reached: true,
      };
    }
    const until = Date.now() + (outcome.cooldownMs || 60 * 1000);
    if (outcome.keyWide) {
      // Межу вичерпано на ключі — інші моделі відповідять тим самим. Ставимо в
      // холодну весь ланцюг одразу, щоб наступні розбори не платили шістьма
      // запитами за ту саму відповідь.
      for (const other of models) cooldownUntil.set(other, until);
      break;
    }
    // cooldown / error → remember and try the next model with free quota
    cooldownUntil.set(model, until);
  }

  return { result: null, reached };
}

/** Сумісна обгортка для тих, кому потрібен лише результат. */
export const parseWithGemini = async (args) => (await attemptWithGemini(args)).result;
