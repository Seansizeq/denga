import fs from 'fs';
import path from 'path';

const BACKUP_RETENTION = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 0–23, час сервера (див. `timedatectl` на VPS) */
const backupDailyHour = (() => {
  const n = parseInt(String(process.env.BACKUP_DAILY_HOUR ?? '6').trim(), 10);
  if (!Number.isFinite(n)) return 6;
  return Math.min(23, Math.max(0, n));
})();

/**
 * @param {import('node-telegram-bot-api')} [options.bot]
 * @param {number | null} [options.telegramChatId]  chat_id, куди шлемо файл
 */
function msUntilNextRunHour() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(backupDailyHour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

/**
 * Знімок БД: VACUUM INTO (узгоджена копія) + очищення старих файлів.
 * Опційно — відправка останнього бекапу в Telegram.
 */
export function startScheduledDatabaseBackups(db, dbFilePath, options = {}) {
  const { bot, telegramChatId } = options;

  const run = async () => {
    const backupDir = path.join(path.dirname(dbFilePath), 'backups');
    let dest = null;
    try {
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      dest = path.join(backupDir, `database-${stamp}.sqlite`);
      const destSql = dest.replace(/\\/g, '/').replace(/'/g, "''");
      await db.exec(`VACUUM INTO '${destSql}'`);
      const files = fs
        .readdirSync(backupDir)
        .filter((f) => f.startsWith('database-') && f.endsWith('.sqlite'))
        .map((f) => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      for (const { f } of files.slice(BACKUP_RETENTION)) {
        fs.unlinkSync(path.join(backupDir, f));
      }
      console.log('[db-backup] wrote', path.basename(dest));
    } catch (e) {
      console.error('[db-backup] failed', e);
      return;
    }

    if (bot && telegramChatId != null && dest && fs.existsSync(dest)) {
      try {
        const stat = fs.statSync(dest);
        const max = 45 * 1024 * 1024;
        if (stat.size > max) {
          console.warn('[db-backup] file too large for Telegram, skip send', stat.size);
          return;
        }
        const day = new Date().toISOString().slice(0, 10);
        await bot.sendDocument(telegramChatId, dest, {
          caption: `Denga · бекап БД · ${day}`,
        });
        console.log('[db-backup] sent to Telegram', telegramChatId);
      } catch (e) {
        console.error('[db-backup] telegram send failed', e);
      }
    }
  };

  setTimeout(() => {
    void run();
    setInterval(() => {
      void run();
    }, DAY_MS);
  }, msUntilNextRunHour());
}
