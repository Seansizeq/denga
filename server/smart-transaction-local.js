// Local-model provider for smart transaction parsing.
//
// Talks the OpenAI chat-completions dialect, so it works with anything that
// speaks it: llama.cpp's `llama-server`, LM Studio, Ollama's /v1 endpoint,
// vLLM. Nothing here is specific to one runner beyond the URL.
//
// Configure with LOCAL_LLM_URL (origin, e.g. http://127.0.0.1:8080),
// LOCAL_LLM_API_KEY and optionally LOCAL_LLM_MODEL / LOCAL_LLM_TIMEOUT_MS /
// LOCAL_LLM_REASONING_EFFORT.

import { buildResponseSchema, buildSystemPrompt, normalizeResult } from './smart-transaction-shared.js';

const DEFAULT_TIMEOUT_MS = 60_000;

// Read lazily, for the same reason as the Gemini key: ESM imports evaluate
// before dotenv.config() runs in the importing module.
const getBaseUrl = () => String(process.env.LOCAL_LLM_URL ?? '').trim().replace(/\/+$/, '');

export const isLocalModelEnabled = () => Boolean(getBaseUrl());

const resolveTimeoutMs = () => Number(process.env.LOCAL_LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

/**
 * A local model runs on hardware nobody is renting by the token, so the budget
 * is patience, not quota — the timeout is far longer than Gemini's 15s. First
 * call after a model loads is the slow one.
 */
export async function parseWithLocalModel({ text, categories, accounts = [], defaultCurrency = 'UAH', today }) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;

  const system = buildSystemPrompt({ categories, accounts, defaultCurrency, today });

  let res;
  try {
    res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.LOCAL_LLM_API_KEY
          ? { authorization: `Bearer ${process.env.LOCAL_LLM_API_KEY}` }
          : {}),
      },
      signal: AbortSignal.timeout(resolveTimeoutMs()),
      body: JSON.stringify({
        model: process.env.LOCAL_LLM_MODEL || 'local',
        temperature: 0,
        max_tokens: 200,
        // LM Studio exposes this OpenAI-compatible switch for reasoning models.
        // Keeping it opt-in preserves compatibility with strict servers that do
        // not recognize the field. For short extraction tasks, "none" prevents
        // Qwen from spending the whole output budget on hidden reasoning.
        ...(process.env.LOCAL_LLM_REASONING_EFFORT
          ? { reasoning_effort: process.env.LOCAL_LLM_REASONING_EFFORT }
          : {}),
        // llama.cpp compiles the schema into a GBNF grammar, so `category_id`
        // cannot come back outside the enum and the JSON cannot come back
        // broken. Without this a small model misses the format often enough to
        // make the feature feel random.
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'transaction', strict: true, schema: buildResponseSchema(categories.map((c) => c.id)) },
        },
        // The prompt goes in the user turn rather than a system message: Gemma's
        // chat template has no system role at all, and every other template
        // understands instructions that arrive this way. Folding is the option
        // that works everywhere; a system role is the one that breaks somewhere.
        messages: [{ role: 'user', content: `${system}\n\n---\n\n${text}` }],
      }),
    });
  } catch (err) {
    // Timeout, connection refused, laptop asleep — all the same to the caller:
    // no answer, fall back to the manual flow.
    console.warn('[smart-transaction] local model request failed:', err?.message || err);
    return null;
  }

  if (!res.ok) {
    console.warn(`[smart-transaction] local model HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    return null;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) return null;

  const parsed = parseModelJson(raw);
  if (!parsed) {
    console.warn('[smart-transaction] local model returned unparseable JSON:', String(raw).slice(0, 200));
    return null;
  }
  return normalizeResult(parsed, { categories, accounts, defaultCurrency, today });
}

/**
 * Constrained decoding should make this a plain JSON.parse. It is tolerant of a
 * markdown fence anyway, because "OpenAI-compatible" is a family resemblance,
 * not a specification: a server that quietly ignores `response_format` still
 * answers with the right object, just wrapped.
 */
export const parseModelJson = (raw) => {
  const text = String(raw).trim();
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object') return value;
    } catch {
      // try the next shape
    }
  }
  return null;
};
