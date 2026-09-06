import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

/** Скільки чекаємо на `BACKUP_REMOTE_CMD`, перш ніж вважати її завислою. */
const REMOTE_CMD_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Запуск команди доставки. Через оболонку — бо в змінній оточення оператор
 * пише готовий рядок (`rclone copy {file} remote:denga`), а не масив аргументів.
 * Це той самий рівень довіри, що й до самого коду: змінну задає той, хто
 * керує сервером.
 */
const execCommand = (command) =>
  new Promise((resolve, reject) => {
    exec(command, { timeout: REMOTE_CMD_TIMEOUT_MS, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${error.message}${stderr ? `\n${String(stderr).slice(0, 500)}` : ''}`;
        reject(error);
        return;
      }
      resolve(String(stdout ?? ''));
    });
  });

const BACKUP_RETENTION = 20;
/** Пошкоджені копії тримаємо коротко: вони для розслідування, не для відновлення. */
const SUSPECT_RETENTION = 3;
/** Менше однієї сторінки SQLite — це огризок, а не база. */
const MIN_USABLE_BYTES = 4096;

/** 0–23, час сервера (див. `timedatectl` на VPS) */
const backupDailyHour = (() => {
  const n = parseInt(String(process.env.BACKUP_DAILY_HOUR ?? '6').trim(), 10);
  if (!Number.isFinite(n)) return 6;
  return Math.min(23, Math.max(0, n));
})();

function msUntilNextRunHour() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(backupDailyHour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

const removeQuietly = (file) => {
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch {
    /* файлу могло не бути — це не помилка */
  }
};

const sizeOf = (file) => {
  if (!file) return 0;
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
};

const sqlLiteralPath = (p) => p.replace(/\\/g, '/').replace(/'/g, "''");

/** READONLY не створює -wal/-shm поруч із базою; якщо режим недоступний — відкриваємо звично. */
const openForRead = async (filename) => {
  try {
    return await open({ filename, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  } catch {
    return open({ filename, driver: sqlite3.Database });
  }
};

/**
 * Копія придатна лише якщо відкривається, проходить quick_check і віддає дані.
 * Саме цієї перевірки бракувало: нульові файли два місяці вважалися бекапами.
 */
export const verifyBackupFile = async (file) => {
  const size = sizeOf(file);
  if (size === 0) return { ok: false, size, reason: 'файл порожній або не створений' };
  if (size < MIN_USABLE_BYTES) return { ok: false, size, reason: `розмір лише ${size} Б` };

  let probe = null;
  try {
    probe = await openForRead(file);
    const check = await probe.get('PRAGMA quick_check(1)');
    const verdict = String(check?.quick_check ?? '').trim().toLowerCase();
    if (verdict !== 'ok') return { ok: false, size, reason: `quick_check: ${verdict || 'без відповіді'}` };
    const row = await probe.get('SELECT count(*) AS n FROM transactions');
    if (!row || !Number.isFinite(Number(row.n))) {
      return { ok: false, size, reason: 'таблиця transactions не читається' };
    }
    return { ok: true, size, transactions: Number(row.n) };
  } catch (e) {
    return { ok: false, size, reason: e?.message || String(e) };
  } finally {
    if (probe) {
      try {
        await probe.close();
      } catch {
        /* закриття проби не впливає на результат */
      }
    }
  }
};

/**
 * Знімок через окреме зʼєднання. На спільному із застосунком зʼєднанні VACUUM
 * зривається чужою відкритою транзакцією, і зловити це майже неможливо.
 */
const vacuumInto = async (dbFilePath, dest) => {
  let source = null;
  try {
    source = await openForRead(dbFilePath);
    await source.exec(`VACUUM INTO '${sqlLiteralPath(dest)}'`);
  } finally {
    if (source) {
      try {
        await source.close();
      } catch {
        /* ігноруємо */
      }
    }
  }
};

/** Діагноз джерела — щоб в алерті було видно, це збій копіювання чи пошкоджена база. */
const checkSourceIntegrity = async (dbFilePath) => {
  let probe = null;
  try {
    probe = await openForRead(dbFilePath);
    const row = await probe.get('PRAGMA quick_check(1)');
    return String(row?.quick_check ?? '').trim() || 'без відповіді';
  } catch (e) {
    return e?.message || String(e);
  } finally {
    if (probe) {
      try {
        await probe.close();
      } catch {
        /* ігноруємо */
      }
    }
  }
};

const isSuspect = (name) => name.includes('-suspect');

/**
 * Прибирання виконується завжди, навіть після невдалого знімка: раніше `return`
 * до цього місця дав 74 файли замість 20.
 */
export const pruneOldBackups = (backupDir) => {
  let removed = 0;
  try {
    const entries = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('database-') && f.endsWith('.sqlite'))
      .map((f) => {
        const full = path.join(backupDir, f);
        let mtimeMs = 0;
        try {
          mtimeMs = fs.statSync(full).mtimeMs;
        } catch {
          /* файл зник між readdir і stat */
        }
        return { name: f, full, size: sizeOf(full), mtimeMs };
      });

    for (const item of entries.filter((x) => x.size < MIN_USABLE_BYTES)) {
      removeQuietly(item.full);
      removed += 1;
    }

    const byAgeDesc = (a, b) => b.mtimeMs - a.mtimeMs;
    const usable = entries.filter((x) => x.size >= MIN_USABLE_BYTES);
    const healthy = usable.filter((x) => !isSuspect(x.name)).sort(byAgeDesc);
    const suspect = usable.filter((x) => isSuspect(x.name)).sort(byAgeDesc);

    for (const item of [...healthy.slice(BACKUP_RETENTION), ...suspect.slice(SUSPECT_RETENTION)]) {
      removeQuietly(item.full);
      removed += 1;
    }
  } catch (e) {
    console.error('[db-backup] prune failed', e);
  }
  return removed;
};

const sendAlert = async (bot, chatId, lines) => {
  if (!bot || chatId == null) return;
  try {
    await bot.sendMessage(chatId, lines.join('\n'));
  } catch (e) {
    console.error('[db-backup] alert send failed', e);
  }
};

/**
 * Один знімок БД: VACUUM INTO (узгоджена копія) з перевіркою результату,
 * запасним шляхом через копію файлу та алертом у Telegram, якщо не вийшло
 * взагалі. Викликається за розкладом і вручну.
 *
 * @param {import('node-telegram-bot-api')} [options.bot]
 * @param {number | null} [options.telegramChatId]  chat_id, куди шлемо файл і алерти
 * @param {(command: string) => Promise<string>} [options.runCommand]  підміняється в тестах
 * @returns {Promise<{ ok: boolean, file: string | null, reason?: string }>}
 */
export async function runDatabaseBackup(db, dbFilePath, options = {}) {
  const { bot, telegramChatId, runCommand } = options;
  const backupDir = path.join(path.dirname(dbFilePath), 'backups');
  let dest = null;
  let method = null;
  let result = { ok: false, size: 0, reason: 'не виконувалось' };

  try {
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    dest = path.join(backupDir, `database-${stamp}.sqlite`);

    try {
      await vacuumInto(dbFilePath, dest);
      result = await verifyBackupFile(dest);
      method = 'VACUUM INTO';
    } catch (e) {
      result = { ok: false, size: sizeOf(dest), reason: e?.message || String(e) };
    }

    // VACUUM перечитує кожну сторінку, тому на пошкодженій базі падає, встигнувши
    // створити порожній файл. Побайтова копія сторінок не читає і виживає там, де
    // VACUUM здається — але спершу зливаємо WAL, інакше копія відстане на всі
    // незакріплені записи.
    if (!result.ok) {
      const vacuumReason = result.reason;
      removeQuietly(dest);
      try {
        await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        fs.copyFileSync(dbFilePath, dest);
        result = await verifyBackupFile(dest);
        method = 'копія файлу';
      } catch (e) {
        result = { ok: false, size: sizeOf(dest), reason: e?.message || String(e) };
      }
      if (result.ok) {
        console.warn('[db-backup] VACUUM INTO не вдався (%s), збережено копію файлу', vacuumReason);
      } else {
        result.reason = `VACUUM INTO: ${vacuumReason}; копія: ${result.reason}`;
      }
    }
  } catch (e) {
    result = { ok: false, size: sizeOf(dest), reason: e?.message || String(e) };
  }

  // Файл є, але перевірку не проходить — лишаємо під іншим імʼям. З пошкодженої
  // бази дані дістаються дампом, тож така копія цінніша за її відсутність.
  let keptSuspect = null;
  if (!result.ok && dest && result.size >= MIN_USABLE_BYTES) {
    keptSuspect = dest.replace(/\.sqlite$/, '-suspect.sqlite');
    try {
      fs.renameSync(dest, keptSuspect);
    } catch {
      keptSuspect = null;
    }
  }
  if (!result.ok && !keptSuspect) removeQuietly(dest);

  const pruned = pruneOldBackups(backupDir);

  if (!result.ok) {
    console.error('[db-backup] failed:', result.reason);
    const integrity = await checkSourceIntegrity(dbFilePath);
    const lines = [
      '🚨 Denga: бекап БД не створено',
      `Причина: ${result.reason}`,
      `Стан джерела: ${integrity}`,
    ];
    if (integrity !== 'ok') {
      lines.push('База пошкоджена. Дані ще читаються, але потрібне відновлення дампом.');
    }
    if (keptSuspect) lines.push(`Збережено неперевірену копію: ${path.basename(keptSuspect)}`);
    await sendAlert(bot, telegramChatId, lines);
    return { ok: false, file: keptSuspect, reason: result.reason };
  }

  console.log(
    '[db-backup] wrote %s (%s, %d Б, транзакцій: %d, прибрано старих: %d)',
    path.basename(dest),
    method,
    result.size,
    result.transactions,
    pruned,
  );

  // Копія на диску вже є; далі — спроба відправити її кудись назовні. Невдача
  // тут не робить бекап невдалим, але й не має пройти непоміченою.
  const offsite = await deliverBackupOffsite(dest, result.size, { bot, telegramChatId, runCommand });

  return { ok: true, file: dest, offsite };
}

/**
 * Скільки важить файл, який Telegram ще приймає від бота.
 * Ліміт їхній, не наш: більший `sendDocument` просто відкидає.
 */
export const TELEGRAM_DOCUMENT_LIMIT_BYTES = 45 * 1024 * 1024;

const formatMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

/**
 * Віднести копію за межі сервера.
 *
 * Досі це був `sendDocument` у Telegram, і рівно один рядок вирішував долю
 * офсайт-копій: файл більший за 45 МБ мовчки пропускався з `console.warn`. На
 * базі, що виросла разом із кількістю людей, це означало б, що офсайт-копії
 * тихо припинилися — а помітили б це вже тоді, коли вони знадобилися.
 *
 * Тепер великий файл — це привід не для мовчання, а для алерту. І для нього є
 * альтернатива: `BACKUP_REMOTE_CMD` виконує довільну команду з `{file}`,
 * заміненим на шлях копії (rclone, scp, aws s3 cp — що налаштовано).
 *
 * @returns {Promise<{ telegram: string, remote: string }>} що саме сталося
 */
export async function deliverBackupOffsite(file, size, { bot, telegramChatId, runCommand = execCommand } = {}) {
  const outcome = { telegram: 'skipped', remote: 'skipped' };

  const remoteTemplate = String(process.env.BACKUP_REMOTE_CMD ?? '').trim();
  if (remoteTemplate) {
    const command = remoteTemplate.replaceAll('{file}', file);
    try {
      await runCommand(command);
      outcome.remote = 'ok';
      console.log('[db-backup] офсайт-копія відправлена командою BACKUP_REMOTE_CMD');
    } catch (e) {
      outcome.remote = 'failed';
      console.error('[db-backup] BACKUP_REMOTE_CMD не виконалась:', e?.message || e);
      await sendAlert(bot, telegramChatId, [
        '🚨 Denga: офсайт-копія БД не відправлена',
        `Команда BACKUP_REMOTE_CMD завершилась помилкою: ${String(e?.message || e).slice(0, 300)}`,
        `Локальна копія на місці: ${path.basename(file)}`,
      ]);
    }
  }

  if (!bot || telegramChatId == null) return outcome;

  if (size > TELEGRAM_DOCUMENT_LIMIT_BYTES) {
    outcome.telegram = 'too_large';
    console.warn('[db-backup] файл більший за ліміт Telegram, надсилаю алерт замість файлу', size);
    // Якщо працює BACKUP_REMOTE_CMD — копія все одно поїхала, і це не аварія,
    // а повідомлення про те, що канал доставки змінився.
    const lines = outcome.remote === 'ok'
      ? [
          'ℹ️ Denga: бекап БД більше не влазить у Telegram',
          `Розмір: ${formatMb(size)} (ліміт ${formatMb(TELEGRAM_DOCUMENT_LIMIT_BYTES)}).`,
          'Копія відправлена через BACKUP_REMOTE_CMD — файлом сюди більше не приходить.',
        ]
      : [
          '🚨 Denga: офсайт-копії БД припинилися',
          `Бекап важить ${formatMb(size)} — Telegram приймає до ${formatMb(TELEGRAM_DOCUMENT_LIMIT_BYTES)}.`,
          'Копія лишається ТІЛЬКИ на сервері. Налаштуйте BACKUP_REMOTE_CMD (rclone/scp/s3).',
        ];
    await sendAlert(bot, telegramChatId, lines);
    return outcome;
  }

  try {
    const day = new Date().toISOString().slice(0, 10);
    await bot.sendDocument(telegramChatId, file, { caption: `Denga · бекап БД · ${day}` });
    outcome.telegram = 'ok';
    console.log('[db-backup] sent to Telegram', telegramChatId);
  } catch (e) {
    outcome.telegram = 'failed';
    console.error('[db-backup] telegram send failed', e);
  }
  return outcome;
}

/** Щоденний розклад поверх `runDatabaseBackup`. */
export function startScheduledDatabaseBackups(db, dbFilePath, options = {}) {
  // Паузу рахуємо щоразу заново: фіксований інтервал у добу повзе при переході
  // на літній час і після кожного запуску, що затягнувся.
  const scheduleNext = () => {
    setTimeout(() => {
      void runDatabaseBackup(db, dbFilePath, options)
        .catch((e) => console.error('[db-backup] unexpected failure', e))
        .finally(scheduleNext);
    }, msUntilNextRunHour());
  };
  scheduleNext();
}
