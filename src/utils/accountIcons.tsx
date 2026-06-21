import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  CircleDollarSign,
  Coins,
  CreditCard,
  HandCoins,
  Landmark,
  PiggyBank,
  TrendingUp,
  Wallet,
} from 'lucide-react';

export const ACCOUNT_ICON_KEYS = [
  'auto',
  'CreditCard',
  'Landmark',
  'Wallet',
  'Banknote',
  'PiggyBank',
  'Coins',
  'CircleDollarSign',
  'HandCoins',
  'TrendingUp',
] as const;

export type AccountIconKey = (typeof ACCOUNT_ICON_KEYS)[number];

const ICON_MAP: Record<Exclude<AccountIconKey, 'auto'>, LucideIcon> = {
  CreditCard,
  Landmark,
  Wallet,
  Banknote,
  PiggyBank,
  Coins,
  CircleDollarSign,
  HandCoins,
  TrendingUp,
};

const isAccountIconKey = (v: string): v is AccountIconKey =>
  (ACCOUNT_ICON_KEYS as readonly string[]).includes(v);

export function parseStoredIconKey(raw: string | null | undefined): AccountIconKey | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || s === 'auto') return null;
  return isAccountIconKey(s) ? s : null;
}

type AccountSection = 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt';

export function defaultAccountIconKey(
  accountKey: string,
  section: AccountSection,
  cryptoSymbol?: string | null
): Exclude<AccountIconKey, 'auto'> {
  const k = accountKey.trim().toLowerCase();
  if (section === 'bank') {
    if (k === 'pumb' || k === 'privat24') return 'Landmark';
    return 'CreditCard';
  }
  if (section === 'cash') {
    if (k === 'wallet') return 'Wallet';
    return 'Banknote';
  }
  if (section === 'crypto') {
    const sym = (cryptoSymbol ?? '').toUpperCase();
    if (sym === 'USDT' || sym === 'USDC') return 'CircleDollarSign';
    return 'Coins';
  }
  if (section === 'stocks') return 'TrendingUp';
  if (section === 'debt') return 'HandCoins';
  return 'CreditCard';
}

export function resolveAccountIconKey(
  stored: string | null | undefined,
  accountKey: string,
  section: AccountSection,
  cryptoSymbol?: string | null
): Exclude<AccountIconKey, 'auto'> {
  const parsed = parseStoredIconKey(stored);
  if (parsed && parsed !== 'auto') return parsed;
  return defaultAccountIconKey(accountKey, section, cryptoSymbol);
}

export function AccountIconGlyph({
  iconKey,
  size = 20,
  strokeWidth = 2.25,
  className,
}: {
  iconKey: Exclude<AccountIconKey, 'auto'>;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Cmp = ICON_MAP[iconKey];
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}

/** Strip emoji / punctuation; keep letters & digits (Latin + Cyrillic). */
export function sanitizeAccountBadge(input: string, name: string, maxLen = 3): string {
  const trimmed = input.trim();
  const fromBadge = trimmed.replace(/[^\p{L}\p{N}]/gu, '');
  if (fromBadge.length > 0) {
    return fromBadge.length <= maxLen ? fromBadge.toUpperCase() : fromBadge.slice(0, maxLen).toUpperCase();
  }
  const fromName = name.trim().replace(/[^\p{L}\p{N}]/gu, '');
  if (fromName.length >= 2) return fromName.slice(0, 2).toUpperCase();
  if (fromName.length === 1) return fromName.toUpperCase();
  const ch = name.trim().slice(0, 1);
  return ch ? ch.toUpperCase() : '?';
}
