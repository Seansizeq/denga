// Hosted provider for smart transaction parsing: any OpenAI-compatible API that
// bills by the token. In production that is OpenRouter with
// `anthropic/claude-haiku-5.5`.
//
// Configure with CLOUD_LLM_URL (e.g. https://openrouter.ai/api), CLOUD_LLM_API_KEY,
// CLOUD_LLM_MODEL and optionally CLOUD_LLM_TIMEOUT_MS / CLOUD_LLM_REASONING_EFFORT.
//
// It is its own provider rather than another URL for `local`, so the two can
// share one chain: the hosted model first, the one on our own machine behind it.

import { createOpenAiCompatibleProvider } from './smart-transaction-openai.js';

/**
 * A hosted model answers in a couple of seconds, so 20s is already a hang —
 * and the person in the chat waits through all of it before the fallback starts.
 *
 * No key means every call comes back 401, and a 401 still counts as reached and
 * spends the person's daily slot. Until the key is set, the provider stays out.
 *
 * Temperature is left at the server's default: Claude Haiku 5.5 rejects any
 * other sampling value, and the strict schema is what keeps the answer in shape.
 */
const cloud = createOpenAiCompatibleProvider({
  envPrefix: 'CLOUD_LLM',
  label: 'cloud model',
  defaultTimeoutMs: 20_000,
  requireApiKey: true,
});

export const isCloudModelEnabled = cloud.isEnabled;
export const attemptWithCloudModel = cloud.attempt;
