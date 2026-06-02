import { useMemo } from 'react';
import { ACCOUNT_NOTE_KEYS, type AccountNoteKey } from '../utils/transactionAccount';
import type { Language } from '../i18n/translations';

const ACCOUNT_CHIP_LABELS: Record<AccountNoteKey, Record<Language, string>> = {
  pumb: { uk: 'PUMB', ru: 'PUMB', en: 'PUMB' },
  privat24: { uk: 'Privat24', ru: 'Privat24', en: 'Privat24' },
  wallet: { uk: 'Готівка', ru: 'Наличные', en: 'Cash' },
  crypto: { uk: 'Crypto', ru: 'Крипто', en: 'Crypto' },
  sol: { uk: 'SOL', ru: 'SOL', en: 'SOL' },
  ton: { uk: 'TON', ru: 'TON', en: 'TON' },
  usdt: { uk: 'USDT', ru: 'USDT', en: 'USDT' },
  misha: { uk: 'Борг', ru: 'Долг', en: 'Debt' },
};

export interface PortfolioAccountRow {
  key: string;
  name: string;
}

export function usePaymentAccountOptions(
  portfolioAccounts: PortfolioAccountRow[],
  language: Language,
) {
  const allowedPaymentKeys = useMemo(() => {
    const s = new Set<string>([...ACCOUNT_NOTE_KEYS]);
    portfolioAccounts.forEach((r) => s.add(r.key));
    return s;
  }, [portfolioAccounts]);

  const paymentChipOptions = useMemo(() => {
    const seen = new Set<string>();
    const seenLabels = new Set<string>();
    const out: { key: string; label: string }[] = [];
    for (const r of portfolioAccounts) {
      const key = String(r.key ?? '').trim().toLowerCase();
      const label = String(r.name ?? '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (label) seenLabels.add(label.toLowerCase());
      out.push({ key, label: label || key });
    }
    for (const k of ACCOUNT_NOTE_KEYS) {
      const key = String(k).trim().toLowerCase();
      const label = ACCOUNT_CHIP_LABELS[k][language];
      if (seen.has(key) || seenLabels.has(label.toLowerCase())) continue;
      seen.add(key);
      seenLabels.add(label.toLowerCase());
      out.push({ key, label });
    }
    return out;
  }, [portfolioAccounts, language]);

  return { allowedPaymentKeys, paymentChipOptions };
}
