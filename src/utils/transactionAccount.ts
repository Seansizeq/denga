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

const ACCOUNT_RE = /\bAccount:\s*([a-z0-9_]{1,48})\b/gi;

/** Будь-який ключ `Account: slug` з примітки (нижній регістр). */
export const getAccountSlugFromNote = (note?: string): string | null => {
  if (!note) return null;
  const m = note.match(/\bAccount:\s*([a-z0-9_]{1,48})\b/i);
  if (!m?.[1]) return null;
  return m[1].toLowerCase();
};

/** Лише «класичні» ключі (для сумісності). */
export const getAccountKeyFromNote = (note?: string): AccountNoteKey | null => {
  const s = getAccountSlugFromNote(note);
  if (!s || !(ACCOUNT_NOTE_KEYS as readonly string[]).includes(s)) return null;
  return s as AccountNoteKey;
};

export const stripAccountFromNote = (note: string): string =>
  note.replace(ACCOUNT_RE, ' ').replace(/\s+/g, ' ').trim();

/** `allowedKeys` — усі рахунки, з яких дозволено списання (API + базові). */
export const mergeAccountIntoNote = (
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
