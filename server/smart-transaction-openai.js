// The OpenAI chat-completions dialect, shared by every provider that speaks it:
// llama.cpp's `llama-server`, LM Studio, Ollama's /v1 endpoint, vLLM, and
// hosted routers such as OpenRouter. Nothing here is specific to one server
// beyond the URL.
//
// Each provider is this same request under its own env prefix — `local` reads
// LOCAL_LLM_*, `cloud` reads CLOUD_LLM_* — so both can sit in one chain:
//   <PREFIX>_URL               origin, e.g. http://127.0.0.1:8080 (a trailing /v1 is tolerated)
//   <PREFIX>_API_KEY           sent as a bearer token when set
//   <PREFIX>_MODEL             model name the server expects
//   <PREFIX>_TIMEOUT_MS        overrides the provider's default
//   <PREFIX>_REASONING_EFFORT  passed through as `reasoning_effort`

import { buildResponseSchema, buildSystemPrompt, normalizeResult } from './smart-transaction-shared.js';

/**
 * @param {object} options
 * @param {string} options.envPrefix — `LOCAL_LLM`, `CLOUD_LLM`
 * @param {string} options.label — how the provider names itself in the log
 * @param {number} options.defaultTimeoutMs
 * @param {boolean} [options.requireApiKey] — stay out of the chain until a key is set
 * @param {number} [options.temperature] — omitted from the request when undefined
 * @param {number} [options.maxTokens] — the answer is ~70 tokens; this is the ceiling
 * @param {string} [options.defaultReasoningEffort] — used when <PREFIX>_REASONING_EFFORT is unset
 */
export const createOpenAiCompatibleProvider = ({
  envPrefix,
  label,
  defaultTimeoutMs,
  requireApiKey = false,
  temperature,
  maxTokens = 200,
  defaultReasoningEffort = '',
}) => {
  // Read lazily, for the same reason as the Gemini key: ESM imports evaluate
  // before dotenv.config() runs in the importing module.
  const env = (name) => String(process.env[`${envPrefix}_${name}`] ?? '').trim();

  // Hosted APIs document their base URL with /v1 already on it, and that is
  // what people paste. The path below adds its own, so drop theirs.
  const getBaseUrl = () => env('URL').replace(/\/+$/, '').replace(/\/v1$/, '');

  const isEnabled = () => Boolean(getBaseUrl()) && (!requireApiKey || Boolean(env('API_KEY')));

  const resolveTimeoutMs = () => Number(env('TIMEOUT_MS')) || defaultTimeoutMs;

  /**
   * @returns {Promise<{ result: object|null, reached: boolean }>} `reached` — сервер
   * моделі відповів (будь-яким статусом). Хибне значення означає, що запит не
   * доїхав узагалі: ноутбук спить, порт закритий, тайлнет мовчить — тобто спроба
   * нічого не коштувала й нікому.
   */
  const attempt = async ({ text, categories, accounts = [], defaultCurrency = 'UAH', today }) => {
    if (!isEnabled()) return { result: null, reached: false };

    const system = buildSystemPrompt({ categories, accounts, defaultCurrency, today });
    const apiKey = env('API_KEY');
    const reasoningEffort = env('REASONING_EFFORT') || defaultReasoningEffort;

    let res;
    try {
      res = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(resolveTimeoutMs()),
        body: JSON.stringify({
          model: env('MODEL') || 'local',
          ...(temperature === undefined ? {} : { temperature }),
          max_tokens: maxTokens,
          // LM Studio exposes this OpenAI-compatible switch for reasoning models.
          // Keeping it opt-in preserves compatibility with strict servers that do
          // not recognize the field. For short extraction tasks, "none" prevents
          // Qwen from spending the whole output budget on hidden reasoning.
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
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
      console.warn(`[smart-transaction] ${label} request failed:`, err?.message || err);
      return { result: null, reached: false };
    }

    if (!res.ok) {
      console.warn(`[smart-transaction] ${label} HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      return { result: null, reached: true };
    }

    let data;
    try {
      data = await res.json();
    } catch {
      return { result: null, reached: true };
    }
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return { result: null, reached: true };

    const parsed = parseModelJson(raw);
    if (!parsed) {
      console.warn(`[smart-transaction] ${label} returned unparseable JSON:`, String(raw).slice(0, 200));
      return { result: null, reached: true };
    }
    return {
      result: normalizeResult(parsed, { categories, accounts, defaultCurrency, today }),
      reached: true,
    };
  };

  return { isEnabled, attempt };
};

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
