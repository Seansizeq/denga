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
//
// SMART_TRANSACTION_FALLBACK lists who to ask when the chosen one gives no
// answer — see `resolveFallbackNames`.

import { attemptWithGemini, isGeminiEnabled } from './smart-transaction-gemini.js';
import { attemptWithLocalModel, isLocalModelEnabled } from './smart-transaction-local.js';
import { preferExplicitCategory } from './smart-transaction-shared.js';

const PROVIDERS = {
  gemini: { isEnabled: isGeminiEnabled, attempt: attemptWithGemini },
  local: { isEnabled: isLocalModelEnabled, attempt: attemptWithLocalModel },
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

let warnedAboutFallback = null;

/**
 * Запасні провайдери: кого питати, коли основний не відповів.
 *
 * Порожньо за замовчуванням — і це не обережність заради обережності. `local`
 * вибирають рівно для того, щоб текст витрат не покидав свою машину; мовчазний
 * відкат у Google на першій же мережевій помилці звів би цей вибір нанівець.
 * Тому запасний шлях вмикає та сама людина, що й основний, і бачить його в
 * конфігурації, а не дізнається постфактум.
 *
 * Незнайома назва — не привід глушити основний провайдер (на відміну від
 * `SMART_TRANSACTION_PROVIDER`, де вимкнення й є безпечним боком помилки):
 * рядок, якого немає серед провайдерів, нікуди дані не відправить. Тож така
 * назва просто випадає зі списку, голосно, один раз у лог.
 *
 * @returns {string[]} назви провайдерів у порядку спроб, без основного й дублів
 */
export const resolveFallbackNames = (raw, primaryName) => {
  const unknown = [];
  const out = [];
  for (const part of String(raw ?? '').split(',')) {
    const name = part.trim().toLowerCase();
    if (!name) continue;
    if (!Object.prototype.hasOwnProperty.call(PROVIDERS, name)) {
      unknown.push(name);
      continue;
    }
    if (name === primaryName || out.includes(name)) continue;
    out.push(name);
  }
  if (unknown.length > 0 && warnedAboutFallback !== raw) {
    warnedAboutFallback = raw;
    console.error(
      `[smart-transaction] невідомі імена в SMART_TRANSACTION_FALLBACK: ${unknown.join(', ')}. ` +
        `Доступні: ${PROVIDER_NAMES.join(', ')}. Решта списку працює.`
    );
  }
  return out;
};

/** Основний провайдер плюс запасні — у порядку, в якому їх питатимуть. */
const providerChain = () => {
  const primary = currentProvider();
  if (!primary) return [];
  const fallbacks = resolveFallbackNames(process.env.SMART_TRANSACTION_FALLBACK, primary.name);
  return [primary, ...fallbacks.map((name) => ({ name, ...PROVIDERS[name] }))];
};

/** Whether at least one provider in the chain is configured well enough to call. */
export const isSmartTransactionEnabled = () => providerChain().some((provider) => provider.isEnabled());

/**
 * Розбір із ознакою «чи дійшли ми бодай до когось».
 *
 * `reached` існує заради денної квоти. Квота захищає чужий сервіс від потоку
 * запитів, а не карає людину за спробу: коли модель лежить і жоден запит навіть
 * не пішов, слот має повернутися. Розрізняє це тільки провайдер — знадвору
 * «сервер не відповів» і «сервер відповів дурницею» виглядають однаково.
 *
 * Ланцюг зупиняється на першій **відповіді**, а не на першій вдалій транзакції:
 * `{ isTransaction: false }` — це теж відповідь («це не витрата»), і питати за
 * неї ще й запасного означало б платити двічі за той самий «ні» й відправляти
 * назовні звичайне листування.
 *
 * @returns {Promise<{ result: object|null, reached: boolean }>}
 */
export async function attemptSmartTransaction({
  text,
  categories,
  accounts = [],
  defaultCurrency = 'UAH',
  today = new Date().toISOString().slice(0, 10),
}) {
  if (!text || !Array.isArray(categories) || categories.length === 0) {
    return { result: null, reached: false };
  }

  const chain = providerChain().filter((provider) => provider.isEnabled());
  let reached = false;

  for (const provider of chain) {
    const outcome = await provider.attempt({ text, categories, accounts, defaultCurrency, today });
    reached = reached || outcome?.reached === true;
    const result = outcome?.result ?? null;
    if (result) {
      if (provider !== chain[0]) {
        console.warn(`[smart-transaction] відповів запасний провайдер: ${provider.name}`);
      }
      return { result: preferExplicitCategory(result, { text, categories }), reached };
    }
  }

  return { result: null, reached };
}

/**
 * @returns {Promise<null | {
 *   isTransaction: boolean, amount?: number, currency?: string,
 *   categoryId?: string, categoryName?: string, type?: 'income'|'expense',
 *   date?: string, accountKey?: string|null, accountName?: string|null, note?: string
 * }>}
 */
export async function parseSmartTransaction(args) {
  const { result } = await attemptSmartTransaction(args);
  return result;
}
