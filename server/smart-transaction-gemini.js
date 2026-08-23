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
const DEFAULT_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
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

// Compute how long to skip a rate-limited model. Per-day exhaustion (RPD) won't
// reset soon, so back off longer; per-minute (RPM) clears quickly.
const cooldownFromRateLimit = (errBody) => {
  const message = String(errBody?.error?.message || '');
  if (/per ?day|requests per day|RPD|FreeTier.*Day/i.test(message)) return 30 * 60 * 1000;
  const retry = errBody?.error?.details?.find((d) => String(d?.['@type'] || '').includes('RetryInfo'))?.retryDelay;
  const secs = retry ? parseInt(retry, 10) : NaN;
  if (Number.isFinite(secs)) return Math.max(secs * 1000, 30 * 1000);
  return 60 * 1000;
};

// Call one model. Returns a discriminated outcome so the caller can decide
// whether to fall back to the next model.
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
    return { type: 'error', cooldownMs: 60 * 1000 };
  }

  if (res.status === 429) {
    let errBody = null;
    try {
      errBody = await res.json();
    } catch {
      // ignore
    }
    const cooldownMs = cooldownFromRateLimit(errBody);
    console.warn(`[smart-transaction] ${model} rate-limited (429), cooldown ${Math.round(cooldownMs / 1000)}s`);
    return { type: 'cooldown', cooldownMs };
  }
  if (res.status === 503) {
    return { type: 'cooldown', cooldownMs: 20 * 1000 };
  }
  if (!res.ok) {
    console.warn(`[smart-transaction] ${model} HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    return { type: 'error', cooldownMs: 60 * 1000 };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { type: 'error', cooldownMs: 60 * 1000 };
  }
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) return { type: 'error', cooldownMs: 60 * 1000 };
  try {
    return { type: 'ok', parsed: JSON.parse(raw) };
  } catch {
    console.warn(`[smart-transaction] ${model} could not parse model JSON:`, raw);
    return { type: 'error', cooldownMs: 60 * 1000 };
  }
};

export async function parseWithGemini({ text, categories, accounts = [], defaultCurrency = 'UAH', today }) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

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

  for (const model of candidates) {
    const outcome = await callGeminiModel(model, body, apiKey);
    if (outcome.type === 'ok') {
      cooldownUntil.delete(model);
      return normalizeResult(outcome.parsed, { categories, accounts, defaultCurrency, today });
    }
    // cooldown / error → remember and try the next model with free quota
    cooldownUntil.set(model, Date.now() + (outcome.cooldownMs || 60 * 1000));
  }

  return null;
}
