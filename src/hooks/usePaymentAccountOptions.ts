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

/**
 * `selectedKey` — рахунок, вибраний зараз (напр. у старій транзакції з
 * `Account: privat24`). Навіть якщо його немає в портфелі, показуємо його,
 * щоб вибір не загубився при редагуванні.
 */
export function usePaymentAccountOptions(
  portfolioAccounts: PortfolioAccountRow[],
  language: Language,
  selectedKey?: string,
) {
  const allowedPaymentKeys = useMemo(() => {
    const s = new Set<string>([...ACCOUNT_NOTE_KEYS]);
    portfolioAccounts.forEach((r) => s.add(r.key));
    return s;
  }, [portfolioAccounts]);

  const paymentChipOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; label: string }[] = [];
    for (const r of portfolioAccounts) {
      const key = String(r.key ?? '').trim().toLowerCase();
      const label = String(r.name ?? '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label: label || key });
    }

    // З базових ключів лишається рівно один — той, що вже стоїть у транзакції,
    // яку зараз редагують: інакше вибір загубився б при збереженні. Порожній
    // гаманець раніше підставляв сюди весь список, і людині, яка щойно зайшла,
    // пропонували PUMB, Privat24, SOL — рахунки, яких вона не заводила. Вибір
    // такого нічого не робив: у гаманці його немає, отже й баланс не рухався.
    const selected = String(selectedKey ?? '').trim().toLowerCase();
    for (const k of ACCOUNT_NOTE_KEYS) {
      const key = String(k).trim().toLowerCase();
      if (key !== selected || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label: ACCOUNT_CHIP_LABELS[k][language] });
    }
    return out;
  }, [portfolioAccounts, language, selectedKey]);

  return { allowedPaymentKeys, paymentChipOptions };
}
