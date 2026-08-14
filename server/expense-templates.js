import { normalizeDenomination } from './denomination.js';

export const TEMPLATE_NAME_MAX = 40;
export const TEMPLATE_NOTE_MAX = 120;
/** Enough for quick entry; past this the chip row stops being a shortcut. */
export const TEMPLATES_PER_USER_MAX = 50;

export const mapTemplateRow = (row) => ({
  id: String(row.id),
  name: String(row.name ?? ''),
  type: row.type === 'income' ? 'income' : 'expense',
  amount: row.amount === null || row.amount === undefined ? undefined : Number(row.amount),
  currency: normalizeDenomination(row.currency),
  categoryId: String(row.categoryId ?? row.category_id ?? ''),
  note: row.note ? String(row.note) : undefined,
  account: row.accountKey ?? row.account_key ? String(row.accountKey ?? row.account_key) : undefined,
});

/**
 * Validates a template coming from the client.
 *
 * Transfers are deliberately not templatable: they are defined by a pair of
 * accounts and two amounts, none of which a one-tap chip can stand in for.
 */
export const validateTemplatePayload = (body) => {
  const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) {
    return { ok: false, status: 400, code: 'INVALID_NAME', error: 'name is required' };
  }
  if (name.length > TEMPLATE_NAME_MAX) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_NAME',
      error: `name must be <= ${TEMPLATE_NAME_MAX} chars`,
    };
  }

  const type = body?.type === 'income' ? 'income' : body?.type === 'expense' ? 'expense' : '';
  if (!type) {
    return { ok: false, status: 400, code: 'INVALID_TYPE', error: 'type must be income or expense' };
  }

  const categoryId = typeof body?.categoryId === 'string' ? body.categoryId.trim() : '';
  if (!categoryId) {
    return { ok: false, status: 400, code: 'INVALID_CATEGORY', error: 'categoryId is required' };
  }

  // An amountless template is legitimate: it prefills the category and account
  // and lets the user type today's figure.
  let amount = null;
  if (body?.amount !== undefined && body?.amount !== null && body?.amount !== '') {
    const parsed = Number(body.amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { ok: false, status: 400, code: 'INVALID_AMOUNT', error: 'amount must be > 0 when given' };
    }
    amount = parsed;
  }

  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (note.length > TEMPLATE_NOTE_MAX) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_NOTE',
      error: `note must be <= ${TEMPLATE_NOTE_MAX} chars`,
    };
  }

  const account = typeof body?.account === 'string' ? body.account.trim().toLowerCase() : '';

  return {
    ok: true,
    name,
    type,
    amount,
    currency: normalizeDenomination(body?.currency),
    categoryId,
    note: note || null,
    account: account || null,
  };
};
