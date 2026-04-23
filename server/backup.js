import fs from 'fs';
import path from 'path';

const BACKUP_RETENTION = 20;
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BACKUP_START_DELAY_MS = 2 * 60 * 1000;

/**
 * Periodic consistent snapshots via VACUUM INTO (same folder as DB, `backups/` subdir).
 * Keeps last BACKUP_RETENTION files; does not block startup for long.
 */
export function startScheduledDatabaseBackups(db, dbFilePath) {
  const run = async () => {
    const backupDir = path.join(path.dirname(dbFilePath), 'backups');
    try {
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const dest = path.join(backupDir, `database-${stamp}.sqlite`);
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
    }
  };

  setTimeout(() => {
    void run();
  }, BACKUP_START_DELAY_MS);
  setInterval(() => {
    void run();
  }, BACKUP_INTERVAL_MS);
}
