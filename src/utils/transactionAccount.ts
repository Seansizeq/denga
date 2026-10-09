/** Базові ключі (як у старому портфелі), якщо немає записів у API. */
export const ACCOUNT_NOTE_KEYS = [
  'pumb',
  'privat24',
  'wallet',
  'crypto',
  'sol',
  'ton',
  'usdt',
  'misha',
] as const;

export type AccountNoteKey = (typeof ACCOUNT_NOTE_KEYS)[number];

const ACCOUNT_LABELS: Record<AccountNoteKey, string> = {
  pumb: 'PUMB',
  privat24: 'Privat24',
  wallet: 'Cash',
  crypto: 'Crypto',
  sol: 'SOL',
  ton: 'TON',
  usdt: 'USDT',
  misha: 'Debt',
};

const ACCOUNT_RE = /\bAccount:\s*([a-z0-9_]{1,48})\b/gi;

/** Будь-який ключ `Account: slug` з примітки (нижній регістр). */
export const getAccountSlugFromNote = (note?: string): string | null => {
  if (!note) return null;
  const m = note.match(/\bAccount:\s*([a-z0-9_]{1,48})\b/i);
  if (!m?.[1]) return null;
  return m[1].toLowerCase();
};

export const stripAccountFromNote = (note: string): string =>
  note.replace(ACCOUNT_RE, ' ').replace(/\s+/g, ' ').trim();

/**
 * Рахунок доходу чи витрати. Живе у власному полі; маркер у примітці лишився
 * лише в записах, створених до перенесення, і читається як запасний.
 */
export const getTransactionAccountKey = (
  tx: { accountKey?: string | null; note?: string } | null | undefined,
): string | null => {
  const own = String(tx?.accountKey ?? '').trim().toLowerCase();
  return own || getAccountSlugFromNote(tx?.note);
};

export const formatAccountLabel = (accountKey?: string | null): string => {
  const key = String(accountKey ?? '').trim().toLowerCase();
  if (!key) return '';
  if ((ACCOUNT_NOTE_KEYS as readonly string[]).includes(key)) {
    return ACCOUNT_LABELS[key as AccountNoteKey];
  }
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};
