// Smart transaction parsing — turns a free-text Telegram message
// (e.g. "купив каву 55", "таксі 200 грн", "зарплата 30000") into a structured
// transaction. Returns null when disabled or on any failure, so callers can
// fall back to the manual flow.
//
// This module is only the switch. The prompt, the schema and the validation are
// shared (`smart-transaction-shared.js`); each provider is its own file. Callers
// import from here and never learn which model answered.
//
// Pick one with SMART_TRANSACTION_PROVIDER:
//   gemini (default) — Google Gemini, needs GEMINI_API_KEY
//   local            — any OpenAI-compatible server, needs LOCAL_LLM_URL

import { isGeminiEnabled, parseWithGemini } from './smart-transaction-gemini.js';
import { isLocalModelEnabled, parseWithLocalModel } from './smart-transaction-local.js';

const PROVIDERS = {
  gemini: { isEnabled: isGeminiEnabled, parse: parseWithGemini },
  local: { isEnabled: isLocalModelEnabled, parse: parseWithLocalModel },
};

export const DEFAULT_PROVIDER = 'gemini';
export const PROVIDER_NAMES = Object.keys(PROVIDERS);

/**
 * Unset means Gemini — the behaviour this feature has always had, so adding the
 * switch changes nothing for an existing deployment.
 *
 * An unrecognised name returns null and the feature switches off. Falling back
 * to the default would be the wrong direction to fail: someone who typed
 * `SMART_TRANSACTION_PROVIDER=lokal` was trying to keep the text of their
 * spending on their own machine, and a silent fallback would send it to Google
 * instead. Losing the feature is recoverable; that is not.
 *
 * @returns {string | null}
 */
export const resolveProviderName = (raw) => {
  const name = String(raw ?? '').trim().toLowerCase();
  if (!name) return DEFAULT_PROVIDER;
  return Object.prototype.hasOwnProperty.call(PROVIDERS, name) ? name : null;
};

let warnedAboutName = null;
const currentProvider = () => {
  const raw = process.env.SMART_TRANSACTION_PROVIDER;
  const name = resolveProviderName(raw);
  if (!name) {
    if (warnedAboutName !== raw) {
      warnedAboutName = raw;
      console.error(
        `[smart-transaction] невідомий SMART_TRANSACTION_PROVIDER="${raw}". ` +
          `Доступні: ${PROVIDER_NAMES.join(', ')}. Розумне додавання вимкнено.`
      );
    }
    return null;
  }
  return { name, ...PROVIDERS[name] };
};

/** Whether the selected provider is configured well enough to be worth calling. */
export const isSmartTransactionEnabled = () => {
  const provider = currentProvider();
  return Boolean(provider?.isEnabled());
};

/**
 * @returns {Promise<null | {
 *   isTransaction: boolean, amount?: number, currency?: string,
 *   categoryId?: string, categoryName?: string, type?: 'income'|'expense',
 *   date?: string, accountKey?: string|null, accountName?: string|null, note?: string
 * }>}
 */
export async function parseSmartTransaction({
  text,
  categories,
  accounts = [],
  defaultCurrency = 'UAH',
  today = new Date().toISOString().slice(0, 10),
}) {
  if (!text || !Array.isArray(categories) || categories.length === 0) return null;

  const provider = currentProvider();
  if (!provider || !provider.isEnabled()) return null;

  return provider.parse({ text, categories, accounts, defaultCurrency, today });
}
