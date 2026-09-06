import crypto from 'crypto';

/**
 * Черга звітів, що чекають на відправку.
 *
 * Раніше хвилинний такт і розсилав, і вирішував, кому слати, — одним прохо́дом.
 * Поки людей мало, це працює; на тисячі виходить так: о 21:00 такт починає
 * малювати картки, кожна з них близько півсекунди суцільного рахунку, і тік
 * триває хвилинами. А охоронець від перекриття на цей час просто **пропускає
 * наступні хвилини** — тобто той, у кого час відправки 21:03, не отримує звіт
 * узагалі. Не «пізніше», а ніколи: хвилина минула, і більше вона не настане.
 *
 * Тепер такт лише ставить у чергу — це один індексований запит і кілька
 * вставок, тобто мілісекунди. Малює й шле окремий розбирач, у власному темпі.
 * Черга живе в базі, а не в памʼяті: розсилка о 21:00 не має губитися від
 * деплою о 21:00.
 */

/** Скільки разів пробуємо звіт, перш ніж визнати недоставленим. */
export const REPORT_MAX_ATTEMPTS = 3;

/** Скільки звітів беремо за один прохід розбирача. */
export const REPORT_DRAIN_BATCH = 5;

/**
 * На скільки хвилин розтягується розсилка.
 *
 * Без розкиду тисяча звітів стає доступною в одну й ту саму секунду, і
 * розбирач пече їх суцільним потоком: пул рендеру займає всі ядра на кілька
 * хвилин, а поруч на тій самій машині живуть процеси API. Пʼятнадцять хвилин
 * перетворюють цей сплеск на рівний фон приблизно в один звіт на секунду.
 *
 * Для людини це «близько девʼятої», а не точна секунда — від звіту за тиждень
 * ніхто не чекає точності до хвилини.
 */
export const REPORT_SPREAD_MINUTES = 15;

/**
 * Зсув конкретної людини в межах вікна розсилки.
 *
 * Рахується з id, а не випадково: зсув має бути тим самим при повторному
 * такті, інакше звіт «стрибав» би по черзі й міг би або продублюватися, або
 * загубитися між тактами.
 */
export const jitterMinutes = (userId, spreadMinutes = REPORT_SPREAD_MINUTES) => {
  if (spreadMinutes <= 0) return 0;
  const digest = crypto.createHash('sha1').update(String(userId)).digest();
  return digest.readUInt32BE(0) % spreadMinutes;
};

/** Момент, коли звіт цієї людини має піти. */
export const reportDueAt = (nowMs, userId, spreadMinutes = REPORT_SPREAD_MINUTES) =>
  new Date(nowMs + jitterMinutes(userId, spreadMinutes) * 60_000).toISOString();

/**
 * Поставити звіт у чергу.
 *
 * Дубль відсікає сам первинний ключ `(user_id, report_type, slot_key)`, а не
 * перевірка перед вставкою, яку можна програти в гонці.
 *
 * `ON CONFLICT ... DO NOTHING`, а не `INSERT OR IGNORE`: друге ковтає **будь-яке**
 * порушення обмежень, а не лише конфлікт ключа. Рядок із зіпсованим `chat_id`
 * тоді зникав би мовчки — і звіт просто ніколи б не пішов, без жодного сліду
 * в логах. Тут така вставка падає, і це правильно.
 */
export const enqueueReport = async (db, { userId, chatId, reportType, slotKey, timezone, dueAt, nowIso }) => {
  const created = nowIso ?? new Date().toISOString();
  const chat = Number(chatId);
  if (!Number.isFinite(chat)) throw new Error(`enqueueReport: некоректний chatId для ${userId}`);
  const res = await db.run(
    `INSERT INTO report_queue
      (user_id, report_type, slot_key, chat_id, timezone, due_at, attempts, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT (user_id, report_type, slot_key) DO NOTHING`,
    [String(userId), reportType, slotKey, chat, timezone ?? null, dueAt ?? created, created],
  );
  return Boolean(res?.changes);
};

/** Звіти, чий час настав. Найстаріші першими: черга не має ставати LIFO. */
export const claimDueReports = (db, { nowIso = new Date().toISOString(), limit = REPORT_DRAIN_BATCH } = {}) =>
  db.all(
    `SELECT user_id AS userId, report_type AS reportType, slot_key AS slotKey,
            chat_id AS chatId, timezone, attempts
     FROM report_queue
     WHERE due_at <= ?
     ORDER BY due_at ASC
     LIMIT ?`,
    [nowIso, limit],
  );

export const removeReport = (db, { userId, reportType, slotKey }) =>
  db.run('DELETE FROM report_queue WHERE user_id = ? AND report_type = ? AND slot_key = ?', [
    String(userId), reportType, slotKey,
  ]);

/**
 * Відкласти невдалу спробу або здатися.
 *
 * @returns {Promise<'retry' | 'dropped'>}
 */
export const failReport = async (db, { userId, reportType, slotKey, attempts, error, nowMs = Date.now() }) => {
  const next = Number(attempts) + 1;
  if (next >= REPORT_MAX_ATTEMPTS) {
    await removeReport(db, { userId, reportType, slotKey });
    return 'dropped';
  }
  // Пауза росте, але лишається в межах вечора: звіт, доставлений уночі, уже
  // майже нікому не потрібен.
  const waitMs = Math.min(30 * 60_000, 5 * 60_000 * next);
  await db.run(
    `UPDATE report_queue SET attempts = ?, due_at = ?, last_error = ?
     WHERE user_id = ? AND report_type = ? AND slot_key = ?`,
    [next, new Date(nowMs + waitMs).toISOString(), String(error ?? '').slice(0, 200), String(userId), reportType, slotKey],
  );
  return 'retry';
};

/** Скільки звітів чекає і скільки з них уже прострочені. Для `/metrics`. */
export const reportQueueStats = async (db, { nowIso = new Date().toISOString() } = {}) => {
  const row = await db.get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN due_at <= ? THEN 1 ELSE 0 END) AS due,
            SUM(CASE WHEN attempts > 0 THEN 1 ELSE 0 END) AS retrying
     FROM report_queue`,
    [nowIso],
  );
  return {
    total: Number(row?.total) || 0,
    due: Number(row?.due) || 0,
    retrying: Number(row?.retrying) || 0,
  };
};
