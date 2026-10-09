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
 *   - списання **схоже на переказ** (слово «переказ», «поповнення картки»,
 *     назва банку чи біржі). Звичайна покупка на 100 zł і випадкове
 *     зарахування 100 zł за пʼять хвилин — не переказ;
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
    '\\bmonobank\\b',
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

/** Чи схоже списання на переказ, а не на покупку. */
export const isTransferLike = ({ merchant = '', bankCategory = '' } = {}) =>
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
    // Переказом має виглядати саме списання.
    const out = isOut ? record : candidate;
    if (!out.transferHint) return false;
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
