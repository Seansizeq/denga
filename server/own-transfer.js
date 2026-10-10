/**
 * Переказ між своїми картками, що прийшов двома сповіщеннями.
 *
 * Переказ із Privat на ПУМБ — це пуш про списання з однієї картки й пуш про
 * зарахування на іншу. Поодинці кожен виглядає як витрата чи дохід, і облік
 * роздувався: витрат за місяць більше, ніж витрачено, а баланс картки, на яку
 * прийшли гроші, відставав.
 *
 * Тому обидва боки зводяться в один переказ. Зводяться лише тоді, коли:
 *
 *   - хоч один бік **схожий на переказ** (слово «переказ», «поповнення
 *     картки», назва банку чи біржі, код переказу від банку). Звичайна
 *     покупка на 100 zł і зарплата 100 zł за пʼять хвилин — не переказ;
 *   - обидва боки мають рахунок у Denga — інакше нема між чим переказувати;
 *   - суми збігаються з точністю до комісії й різниці курсів (3 %);
 *   - між ними не більше 20 хвилин.
 *
 * Якщо обидві картки ведуться в Denga одним рахунком, переказ нічого не
 * рухає — тоді витрата просто прибирається.
 */

export const PAIR_WINDOW_MS = 20 * 60 * 1000;
export const PAIR_TOLERANCE = 0.03;

const TRANSFER_HINT = new RegExp(
  [
    'переказ',
    'перевод',
    'поповнен',
    'на\\s+картку',
    'на\\s+свою',
    'p2p',
    'card\\s*2\\s*card',
    '\\bc2c\\b',
    'przelew',
    'wp[łl]ata',
    'transfer',
    'top[\\s-]?up',
    '\\bbybit\\b',
    '\\bbinance\\b',
    // «MONODirect» — так ПУМБ підписує зарахування з картки monobank.
    '\\bmono(?:bank|direct)?\\b',
    '\\bprivat(?:24|bank)?\\b',
    // `\b` у JS бачить межі лише латинських слів, тож кирилиця — з явною
    // перевіркою, що поруч немає літери.
    '(?<!\\p{L})приват(?:24|банк)?(?!\\p{L})',
    '(?<!\\p{L})пумб(?!\\p{L})',
    '\\bpumb\\b',
    '\\brevolut\\b',
    '\\bwise\\b',
  ].join('|'),
  'iu',
);

/**
 * Коди виду діяльності (ISO 18245), якими банк сам позначає переказ, а не
 * покупку. Опис тут нічого не скаже: monobank у переказі на картку пише лише
 * імʼя одержувача («Богдан С.»), а код — 4829.
 *
 *   4829 — грошовий переказ; 6012 — фінустанова (поповнення картки, P2P);
 *   6050, 6051 — квазі-готівка (поповнення гаманців, біржі);
 *   6538 — зарахування на картку (MoneySend/Visa Direct); 6540 — поповнення.
 */
const TRANSFER_MCC = new Set([4829, 6012, 6050, 6051, 6538, 6540]);

/** Чи схожий рух грошей на переказ, а не на покупку чи зарплату. */
export const isTransferLike = ({ merchant = '', bankCategory = '', mcc = null } = {}) =>
  TRANSFER_MCC.has(Number.parseInt(String(mcc ?? ''), 10)) ||
  TRANSFER_HINT.test(`${bankCategory ?? ''} ${merchant ?? ''}`);

/**
 * Пара для щойно записаного боку серед кандидатів протилежного напрямку.
 *
 * @param record `{ id, type: 'expense'|'income', amountUsd, accountKey, createdAtMs, transferHint }`
 * @param candidates ті самі поля; уже зведені й без рахунку відсіяно викликачем
 *   не обовʼязково — тут перевіряється все.
 * @returns найкращий кандидат (найближча сума, потім найближчий час) або `null`.
 */
export const findTransferPair = (record, candidates = []) => {
  if (!record?.accountKey || !(record.amountUsd > 0)) return null;
  const isOut = record.type === 'expense';
  const matches = candidates.filter((candidate) => {
    if (!candidate || candidate.id === record.id) return false;
    if (candidate.pairedWith) return false;
    if (!candidate.accountKey || !(candidate.amountUsd > 0)) return false;
    if (candidate.type === record.type) return false;
    // Переказом має виглядати хоч один бік. Буває, що лише один і може це
    // сказати: monobank пише в списанні тільки імʼя одержувача, зате ПУМБ
    // підписує зарахування «MONODirect».
    const [out, incoming] = isOut ? [record, candidate] : [candidate, record];
    if (!out.transferHint && !incoming.transferHint) return false;
    if (Math.abs(candidate.createdAtMs - record.createdAtMs) > PAIR_WINDOW_MS) return false;
    const bigger = Math.max(candidate.amountUsd, record.amountUsd);
    return Math.abs(candidate.amountUsd - record.amountUsd) / bigger <= PAIR_TOLERANCE;
  });
  matches.sort(
    (a, b) =>
      Math.abs(a.amountUsd - record.amountUsd) - Math.abs(b.amountUsd - record.amountUsd) ||
      Math.abs(a.createdAtMs - record.createdAtMs) - Math.abs(b.createdAtMs - record.createdAtMs),
  );
  return matches[0] ?? null;
};
