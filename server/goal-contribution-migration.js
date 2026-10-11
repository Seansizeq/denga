import { backupDatabaseFile } from './crypto-denomination-migration.js';
import { withTransaction } from './transaction.js';

/**
 * Внесок у ціль із рахунку записувався як витрата категорії `other_expense`.
 * Гроші справді йшли з рахунку, але витратою це не було: вони не зникли, а
 * перелягли в ціль. Через ту категорію внески з'їдали бюджет «Інше», зривали
 * budget-алерти й розмивали статистику витрат.
 *
 * Ця міграція перетворює такі транзакції на переказ. Ключова властивість —
 * баланси не рухаються: до міграції ефект списання резолвився через note-маркер
 * `Account: <slug>` (`transaction-effects.js`, гілка витрати), після — через
 * колонку `fromAccountKey` (гілка переказу). Delta в обох випадках `-amount`,
 * тож переграти `applyTransactionEffects` не потрібно.
 */

const accountSlugFromNote = (note) => {
  if (typeof note !== 'string' || !note.trim()) return null;
  const m = note.match(/\bAccount:\s*([a-z0-9_]{1,48})\b/i);
  if (!m?.[1]) return null;
  return m[1].toLowerCase();
};

/**
 * Вирішує, що змінити, не торкаючись бази. Рядки, що вже стали переказом,
 * пропускаються — тож міграція idempotent між перезапусками.
 *
 * Два випадки лишаються витратою назавжди:
 *
 * `NO_ACCOUNT` — рахунок не розпізнати. Без `fromAccountKey` переказ втратив би
 * єдине джерело, і списання просто зникло б із балансу.
 *
 * `DEBT_SOURCE` — джерело є пасивом. Такі внески-витрати записані ще за старим
 * правилом знаку (міграція 006 позначає їх `legacyDebtSign`): витрата з
 * рахунку `owed_by_me` знак не перевертала, а переказ — перевертає. Рядок
 * застосувався як витрата, а відкочувався б уже як переказ: apply і rollback
 * розійшлися б у знаку, і кожне видалення внеску зсувало б баланс. Нові внески
 * з пасиву цієї проблеми не мають — вони переказ з першого дня.
 */
export const planGoalContributionTransferMigration = (rows, resolveSection = () => null) => {
  const updates = [];
  const skipped = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row?.id ?? '').trim();
    if (!id) continue;
    const type = String(row?.type ?? '').trim().toLowerCase();
    // Уже переказ — нічого робити.
    if (type === 'transfer') continue;

    const fromAccountKey =
      String(row?.fromAccountKey ?? '').trim().toLowerCase() || accountSlugFromNote(row?.note);
    if (!fromAccountKey) {
      skipped.push({ id, reason: 'NO_ACCOUNT' });
      continue;
    }
    const section = String(resolveSection(row, fromAccountKey) ?? '').trim().toLowerCase();
    if (section === 'debt') {
      skipped.push({ id, reason: 'DEBT_SOURCE' });
      continue;
    }
    updates.push({
      id,
      fromAccountKey,
      previousType: type,
      previousCategoryId: String(row?.categoryId ?? ''),
    });
  }
  return { updates, skipped };
};

export const runGoalContributionTransferMigration = async (db, dbPath) => {
  let rows;
  let accountRows;
  try {
    rows = await db.all(
      `SELECT t.id AS id, t.user_id AS userId, t.type AS type, t.categoryId AS categoryId, t.note AS note,
              t.fromAccountKey AS fromAccountKey
       FROM transactions t
       JOIN goal_contributions gc ON gc.transaction_id = t.id
       WHERE t.type <> 'transfer'`
    );
    accountRows = await db.all(
      `SELECT user_id AS userId, LOWER(account_key) AS accountKey, section FROM account_portfolio`
    );
  } catch (e) {
    // Свіжа база, де таблиць ще немає — нічого мігрувати.
    console.warn('[migration] goal contribution scan skipped', e?.message ?? e);
    return { migrated: 0, skipped: 0, backupPath: null };
  }

  // Ключ рахунку часто живе лише в note-маркері, тож секцію доводиться шукати
  // вже після того, як планувальник цей ключ дістав.
  const sectionByUserKey = new Map();
  for (const a of accountRows || []) {
    sectionByUserKey.set(`${a.userId}\u0000${a.accountKey}`, a.section);
  }
  const { updates, skipped } = planGoalContributionTransferMigration(rows, (row, accountKey) =>
    sectionByUserKey.get(`${row?.userId}\u0000${accountKey}`)
  );
  const describeSkipped = () => skipped.map((s) => `${s.id}:${s.reason}`).join(', ');
  if (updates.length === 0) {
    if (skipped.length > 0) {
      console.warn(`[migration] goal contributions: ${skipped.length} left as expense — ${describeSkipped()}`);
    }
    return { migrated: 0, skipped: skipped.length, backupPath: null };
  }

  const backupPath = await backupDatabaseFile(db, dbPath, 'goal-contribution-transfer');

  await withTransaction(db, async (tx) => {
    for (const u of updates) {
      await tx.run(
        `UPDATE transactions
         SET type = 'transfer', categoryId = 'transfer', fromAccountKey = ?
         WHERE id = ?`,
        [u.fromAccountKey, u.id]
      );
    }
  });

  console.log(
    `[migration] goal contributions -> transfer: ${updates.length} moved` +
      (skipped.length > 0 ? `, ${skipped.length} left as expense — ${describeSkipped()}` : '')
  );
  return { migrated: updates.length, skipped: skipped.length, backupPath };
};
