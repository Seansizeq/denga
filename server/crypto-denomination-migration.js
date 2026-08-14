import fs from 'fs';
import path from 'path';
import { isCryptoDenomination, parseLegacyCryptoPosition } from './denomination.js';

/**
 * Crypto accounts used to carry two conflicting numbers: `primary_amount` in
 * fiat (typed by hand) and the real position as free text in `sub_text`
 * ("120 USDT"). The UI valued the position and ignored the fiat number, while
 * transfers moved the fiat number and never touched the position — so moving
 * money out of a crypto account changed nothing on screen.
 *
 * This migration makes the position the balance: `primary_amount` becomes the
 * token quantity and `primary_currency` becomes the asset code.
 */

const stripPositionFromSubText = (subText, rawPosition) => {
  if (typeof subText !== 'string') return null;
  // Remove only the first "<qty> <SYMBOL>" occurrence; keep any user note around it.
  // Plain string replace, so no escaping concerns with the matched text.
  const withoutPosition = subText.replace(rawPosition, '').replace(/\s+/g, ' ').trim();
  return withoutPosition || null;
};

/**
 * Decides what to change, without touching the database. Rows already holding a
 * crypto denomination are skipped, which keeps the migration idempotent across
 * restarts.
 */
export const planCryptoDenominationMigration = (rows) => {
  const updates = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const section = String(row?.section ?? '').trim().toLowerCase();
    if (section !== 'crypto') continue;
    // Already migrated: the balance is denominated in the asset itself.
    if (isCryptoDenomination(row?.primaryCurrency)) continue;

    const subText = typeof row?.subText === 'string' ? row.subText : null;
    const position = parseLegacyCryptoPosition(subText);
    // No parsable position: a crypto-section account genuinely held in fiat.
    // Leave it exactly as it is.
    if (!position) continue;

    const match = subText.match(
      new RegExp(`[0-9][0-9\\s\\u00A0\\u202F]*(?:[.,][0-9]+)?\\s*${position.symbol}`, 'i'),
    );
    updates.push({
      accountKey: String(row.accountKey),
      primaryAmount: position.amount,
      primaryCurrency: position.symbol,
      subText: stripPositionFromSubText(subText, match?.[0] ?? `${position.amount} ${position.symbol}`),
      previousAmount: Number(row.primaryAmount),
      previousCurrency: String(row.primaryCurrency ?? ''),
    });
  }
  return updates;
};

/**
 * Copies the database file before a destructive migration. WAL is checkpointed
 * first so the copy is not missing recent writes.
 */
export const backupDatabaseFile = async (db, dbPath, tag) => {
  try {
    await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (e) {
    console.warn('[migration] wal checkpoint failed, backing up anyway', e?.message ?? e);
  }
  const dir = path.join(path.dirname(dbPath), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `pre-${tag}-${stamp}.sqlite`);
  fs.copyFileSync(dbPath, dest);
  console.log('[migration] backup written', dest);
  return dest;
};

export const runCryptoDenominationMigration = async (db, dbPath) => {
  const rows = await db.all(
    `SELECT account_key AS accountKey,
            section,
            primary_amount AS primaryAmount,
            primary_currency AS primaryCurrency,
            sub_text AS subText
     FROM account_portfolio
     WHERE section = 'crypto'`,
  );
  const updates = planCryptoDenominationMigration(rows);
  if (updates.length === 0) return { migrated: 0, backupPath: null };

  const backupPath = await backupDatabaseFile(db, dbPath, 'crypto-denomination');

  await db.run('BEGIN IMMEDIATE');
  try {
    for (const u of updates) {
      await db.run(
        `UPDATE account_portfolio
         SET primary_amount = ?, primary_currency = ?, sub_text = ?, updatedAt = ?
         WHERE account_key = ?`,
        [u.primaryAmount, u.primaryCurrency, u.subText, new Date().toISOString(), u.accountKey],
      );
      console.log(
        `[migration] ${u.accountKey}: ${u.previousAmount} ${u.previousCurrency} -> ${u.primaryAmount} ${u.primaryCurrency}`,
      );
    }
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }
  return { migrated: updates.length, backupPath };
};
