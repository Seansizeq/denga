// Local-model provider for smart transaction parsing: a model on hardware we
// own (LM Studio, llama-server, Ollama), reached over the network.
//
// Configure with LOCAL_LLM_URL (origin, e.g. http://127.0.0.1:8080),
// LOCAL_LLM_API_KEY and optionally LOCAL_LLM_MODEL / LOCAL_LLM_TIMEOUT_MS /
// LOCAL_LLM_REASONING_EFFORT. The request itself is in
// `smart-transaction-openai.js`.

import { createOpenAiCompatibleProvider, parseModelJson } from './smart-transaction-openai.js';

/**
 * A local model runs on hardware nobody is renting by the token, so the budget
 * is patience, not quota — the timeout is far longer than Gemini's 15s. First
 * call after a model loads is the slow one.
 */
const local = createOpenAiCompatibleProvider({
  envPrefix: 'LOCAL_LLM',
  label: 'local model',
  defaultTimeoutMs: 60_000,
  temperature: 0,
});

export const isLocalModelEnabled = local.isEnabled;
export const attemptWithLocalModel = local.attempt;

/** Сумісна обгортка для тих, кому потрібен лише результат. */
export const parseWithLocalModel = async (args) => (await attemptWithLocalModel(args)).result;

export { parseModelJson };
