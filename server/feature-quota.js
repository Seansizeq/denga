/**
 * Денні квоти на дорогі зовнішні виклики.
 *
 * Розпізнавання тексту й скріншотів спирається на чужі безкоштовні сервіси:
 * Gemini рахує запити на ключ, OCR.space — на місяць. Обидва ліміти спільні на
 * весь застосунок, а не на людину. Поки користувач один, це неважливо; на
 * тисячі досить кількох, хто пише боту забагато, — і сервіс замовкає **для
 * всіх**, включно з тими, хто нічого не робив.
 *
 * Наявний ланцюг моделей Gemini з паузами (`smart-transaction-gemini.js`) уже
 * рятує від сплеску: коли одна модель віддає 429, береться наступна. Але це
 * захист від хвилинного піку, а не від людини, яка щодня витрачає добову
 * квоту сама. Бракувало саме межі на користувача.
 *
 * Лічильник у SQLite, а не в памʼяті: після Фази 6 процесів кілька, і кожен
 * рахував би своє. База тут спільна за визначенням.
 */

/** Скільки днів тримаємо лічильники, перш ніж прибрати. */
const RETENTION_DAYS = 7;

/**
 * Межі за замовчуванням.
 *
 * Обидві щедрі для живої людини й тісні для потоку. П'ятдесят розпізнавань
 * тексту — це майже дві на годину протягом усього дня; двадцять чеків —
 * більше, ніж набирається за тиждень звичайних покупок. Хто впреться в таку
 * межу, майже напевно не вводить свої витрати.
 */
export const QUOTA_DEFAULTS = {
  smart_transaction: 50,
  receipt_scan: 20,
};

export const quotaLimit = (feature) => {
  const envKey = `QUOTA_${feature.toUpperCase()}_PER_DAY`;
  const raw = Number(process.env[envKey]);
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  return QUOTA_DEFAULTS[feature] ?? 0;
};

/** День у UTC. Межа доби спільна для всіх — це квота на чужий сервіс, не на людину. */
export const quotaDay = (nowMs = Date.now()) => new Date(nowMs).toISOString().slice(0, 10);

/**
 * Зайняти одиницю квоти.
 *
 * Спершу збільшуємо лічильник, потім дивимось результат — а не навпаки.
 * Перевірка перед збільшенням лишає вікно, у яке два паралельних запити
 * обидва бачать «ще можна» й обидва проходять; на дорогих зовнішніх викликах
 * таке вікно означає перевитрату чужої квоти.
 *
 * Викликач має обгорнути це транзакцією, якщо потрібна сувора точність;
 * `UPSERT` сам по собі атомарний, тож звичайного виклику достатньо.
 *
 * @returns {Promise<{ allowed: boolean, used: number, limit: number, remaining: number }>}
 */
export const consumeQuota = async (db, { userId, feature, nowMs = Date.now() }) => {
  const limit = quotaLimit(feature);
  const day = quotaDay(nowMs);
  const user = String(userId ?? '');

  // Нульова межа означає «вимкнено» — не витрачаємо ні лічильник, ні запис.
  if (!user || limit <= 0) {
    return { allowed: limit > 0, used: 0, limit, remaining: limit };
  }

  // `RETURNING` віддає значення **саме цього** збільшення. Окремий `SELECT`
  // після `UPDATE` тут не годиться: паралельний виклик встигає збільшити
  // лічильник між ними, і обидва бачать однакове завелике число — тобто
  // людині, якій законно належав останній слот, теж прилітає відмова.
  const row = await db.get(
    `INSERT INTO feature_usage (user_id, feature, day, used, updated_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT (user_id, feature, day) DO UPDATE SET used = used + 1, updated_at = excluded.updated_at
     RETURNING used`,
    [user, feature, day, new Date(nowMs).toISOString()],
  );
  const used = Number(row?.used) || 0;
  return { allowed: used <= limit, used, limit, remaining: Math.max(0, limit - used) };
};

/**
 * Повернути одиницю назад.
 *
 * Потрібно рівно тоді, коли зовнішній виклик **не відбувся**: сервіс не
 * налаштований, ключа немає, зображення не доїхало. Квота захищає чужий
 * ліміт, а не карає за спробу — те, що не пішло назовні, його й не витратило.
 *
 * Невдала відповідь провайдера сюди не входить: вона вже коштувала запиту.
 */
export const refundQuota = async (db, { userId, feature, nowMs = Date.now() }) => {
  const user = String(userId ?? '');
  if (!user || quotaLimit(feature) <= 0) return;
  await db.run(
    `UPDATE feature_usage SET used = MAX(0, used - 1), updated_at = ?
     WHERE user_id = ? AND feature = ? AND day = ?`,
    [new Date(nowMs).toISOString(), user, feature, quotaDay(nowMs)],
  );
};

/** Скільки лишилося, не витрачаючи. Для підказок в інтерфейсі. */
export const quotaStatus = async (db, { userId, feature, nowMs = Date.now() }) => {
  const limit = quotaLimit(feature);
  const row = await db.get(
    'SELECT used FROM feature_usage WHERE user_id = ? AND feature = ? AND day = ?',
    [String(userId ?? ''), feature, quotaDay(nowMs)],
  );
  const used = Number(row?.used) || 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
};

/** Прибирання старих лічильників: без нього таблиця росла б на рядок за день на людину. */
export const pruneQuotas = async (db, { nowMs = Date.now() } = {}) => {
  const cutoff = quotaDay(nowMs - RETENTION_DAYS * 86_400_000);
  const res = await db.run('DELETE FROM feature_usage WHERE day < ?', [cutoff]);
  return res?.changes ?? 0;
};

/** Скільки людей сьогодні вперлося в межу. Для `/metrics`. */
export const quotaStats = async (db, { nowMs = Date.now() } = {}) => {
  const rows = await db.all(
    'SELECT feature, COUNT(*) AS users, SUM(used) AS calls FROM feature_usage WHERE day = ? GROUP BY feature',
    [quotaDay(nowMs)],
  );
  const out = {};
  for (const row of rows ?? []) {
    const limit = quotaLimit(row.feature);
    out[row.feature] = { users: Number(row.users) || 0, calls: Number(row.calls) || 0, limit };
  }
  // Скільки саме вперлося — окремим запитом, бо межа в кожної фічі своя.
  for (const feature of Object.keys(QUOTA_DEFAULTS)) {
    const limit = quotaLimit(feature);
    if (limit <= 0) continue;
    const row = await db.get(
      'SELECT COUNT(*) AS n FROM feature_usage WHERE day = ? AND feature = ? AND used >= ?',
      [quotaDay(nowMs), feature, limit],
    );
    out[feature] = { ...(out[feature] ?? { users: 0, calls: 0, limit }), exhausted: Number(row?.n) || 0 };
  }
  return out;
};
