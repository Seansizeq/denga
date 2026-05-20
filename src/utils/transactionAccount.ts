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

/** `allowedKeys` — усі рахунки, з яких дозволено списання (API + базові). */
const mergeAccountIntoNote = (
  note: string,
  accountKey: string,
  allowedKeys: ReadonlySet<string>
): string => {
  const base = stripAccountFromNote(note);
  const key = accountKey.trim().toLowerCase();
  if (!key || !allowedKeys.has(key)) {
    return base;
  }
  return base ? `${base} Account: ${key}` : `Account: ${key}`;
};

export const mergeAccountIntoNoteLimited = (
  note: string,
  accountKey: string,
  allowedKeys: ReadonlySet<string>,
  maxLength = 120
): string => {
  const merged = mergeAccountIntoNote(note, accountKey, allowedKeys);
  if (merged.length <= maxLength) return merged;

  const key = accountKey.trim().toLowerCase();
  if (!key || !allowedKeys.has(key)) return merged.slice(0, maxLength).trim();

  const base = stripAccountFromNote(note).trim();
  const suffix = base ? ` Account: ${key}` : `Account: ${key}`;
  if (suffix.length >= maxLength) return suffix.slice(0, maxLength).trim();

  const available = maxLength - suffix.length;
  const trimmedBase = base.slice(0, available).trim();
  return trimmedBase ? `${trimmedBase}${suffix}` : suffix;
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
