/**
 * Спільний знімок даних застосунку.
 *
 * Клієнт опитував два маршрути кожні пʼять секунд і щоразу отримував усе
 * заново: повний список транзакцій і всі рахунки. При 300 відкритих екранах це
 * близько 12 МБ/с відповідей, у яких майже ніколи нічого не змінюється.
 *
 * Тут той самий вміст віддається одним запитом і з ETag. Версія рахується
 * тригерами в `user_data_version`, тож перевірка «чи змінилося» — це одне
 * читання за первинним ключем, а не перерахунок історії. Коли не змінилося,
 * відповідь — порожній 304.
 */

/** Скільки транзакцій їде в знімку. Старіші довантажує екран історії. */
export const SYNC_TRANSACTION_LIMIT = 500;

/**
 * Версія **форми** відповіді, а не даних.
 *
 * Її треба піднімати щоразу, коли змінюється набір полів. Інакше клієнт із
 * кешем старої форми отримає 304 і ніколи не побачить нових полів: лічильники
 * в базі не змінилися, отже ETag той самий, хоча сервер уже інший.
 */
export const SYNC_SHAPE_VERSION = 1;

/**
 * Поточні лічильники користувача. Відсутній рядок — це нуль, а не помилка:
 * у людини, яка ще нічого не створила, версії й немає.
 */
export const readUserDataVersion = async (db, userId) => {
  const row = await db.get(
    'SELECT transactions_v AS transactions, accounts_v AS accounts FROM user_data_version WHERE user_id = ?',
    [userId],
  );
  return {
    transactions: Number(row?.transactions) || 0,
    accounts: Number(row?.accounts) || 0,
  };
};

/**
 * ETag знімка. Слабкий (`W/`) навмисно: він означає «те саме змістовно», а не
 * «байт у байт», і саме така рівність нам потрібна — порядок ключів у JSON чи
 * `serverTime` всередині відповіді нас не обходять.
 */
export const syncEtag = (version, shapeVersion = SYNC_SHAPE_VERSION) =>
  `W/"${shapeVersion}-t${version.transactions}-a${version.accounts}"`;

/**
 * Чи збігається те, що клієнт уже має, з тим, що ми віддали б.
 *
 * `If-None-Match` за стандартом може містити список через кому, а проксі мають
 * право дописати до значення суфікс на кшталт `-gzip`. Тому порівнюємо не
 * рядок цілком, а кожен елемент, і терпимо суфікс.
 */
export const matchesEtag = (ifNoneMatch, etag) => {
  const raw = String(ifNoneMatch ?? '').trim();
  if (!raw || !etag) return false;
  if (raw === '*') return true;
  return raw.split(',').some((candidate) => {
    const value = candidate.trim();
    if (value === etag) return true;
    // nginx із gzip дописує суфікс усередині лапок: W/"1-t2-a3-gzip".
    return value.replace(/-(?:gzip|br|deflate)"$/, '"') === etag;
  });
};

/**
 * Межі сторінки історії.
 *
 * Тут навмисно `LIMIT/OFFSET`, а не курсор. Сортування списку —
 * `substr(date,1,10) DESC, rowid DESC`, тобто за днем, а всередині дня за
 * порядком додавання; курсор для такої пари вийшов би з двох полів і однаково
 * не потрапив би в індекс через `substr`. А головне — цей шлях холодний:
 * сторінки гортає людина руками, на відміну від знімка, який опитується
 * кожні пʼять секунд. Оптимізувати треба гарячий.
 */
export const parseHistoryPage = ({ limit, offset } = {}, { maxLimit = 500, defaultLimit = 200 } = {}) => {
  const rawLimit = Number(limit);
  const rawOffset = Number(offset);
  return {
    limit: Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), maxLimit) : defaultLimit,
    offset: Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0,
  };
};
