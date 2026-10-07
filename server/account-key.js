import crypto from 'crypto';

/**
 * Ключ нового рахунку.
 *
 * Досі ключ складався з назви: `<id>_<назва латиницею>`, а кирилиця
 * перетворювалась на `account`. Тобто в більшості людей рахунки звались
 * `123_account`, `123_account_2`… і ключ видаленого рахунку діставався
 * наступному створеному. Разом із ключем новий рахунок успадковував усе, що
 * на старий посилалося: транзакції з `Account: <ключ>` у примітці, перекази,
 * привʼязку картки банку. Видалення старої транзакції після цього рухало
 * баланс зовсім іншого рахунку.
 *
 * Тепер у ключі є випадковий хвіст, тож звільнений ключ не повертається.
 * Назва в ньому лишилася лише для впізнаваності в логах.
 *
 * Довжина обмежена тією ж межею, що й у рахунків цілей: для доходу й витрати
 * рахунок їде в примітці маркером `Account: <ключ>`, а регулярка, що його
 * розпізнає, бере не більше 48 символів. Довший ключ просто не впізнався б, і
 * транзакція тихо втратила б рахунок.
 */
export const ACCOUNT_KEY_MAX = 48;

/** Скільки символів назви лишається в ключі. Решту довжини тримаємо під id і хвіст. */
const NAME_PART_MAX = 20;
const SUFFIX_LENGTH = 6;

const defaultSuffix = () => crypto.randomBytes(SUFFIX_LENGTH / 2).toString('hex');

/**
 * @param {string|number} userId
 * @param {string} name назва рахунку, як її ввела людина
 * @param {{ suffix?: () => string }} [options] джерело хвоста — для тестів
 */
export const createAccountKey = (userId, name, { suffix = defaultSuffix } = {}) => {
  const userSlug = String(userId ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const room = Math.max(0, ACCOUNT_KEY_MAX - userSlug.length - SUFFIX_LENGTH - 2);
  const namePart =
    String(name ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+/, '')
      .slice(0, Math.min(NAME_PART_MAX, room))
      .replace(/_+$/, '') || 'account';
  const tail = String(suffix()).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, SUFFIX_LENGTH);
  return `${userSlug}_${namePart}_${tail}`.slice(0, ACCOUNT_KEY_MAX);
};
