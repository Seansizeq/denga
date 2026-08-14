export type AccountSection = 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt';
export type AccountPickerGroup = 'bank' | 'cash' | 'crypto' | 'debt';

export type AccountPickerItem = {
  key: string;
  label: string;
  section: AccountSection;
};

const GROUP_ORDER: Record<AccountPickerGroup, number> = {
  bank: 0,
  cash: 1,
  crypto: 2,
  debt: 3,
};

export const inferAccountSectionFromKey = (key: string): AccountSection => {
  if (key === 'wallet' || key === 'cash') return 'cash';
  if (['crypto', 'sol', 'ton', 'usdt', 'btc', 'eth'].includes(key)) return 'crypto';
  if (key === 'misha' || key === 'debt') return 'debt';
  return 'bank';
};

export const getAccountPickerGroup = (section: AccountSection): AccountPickerGroup => {
  if (section === 'debt') return 'debt';
  if (section === 'crypto' || section === 'stocks') return 'crypto';
  if (section === 'cash') return 'cash';
  return 'bank';
};

export const sortAccountPickerItems = <T extends AccountPickerItem>(
  items: readonly T[],
  locale?: string,
): T[] => {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  return [...items].sort((a, b) => {
    const groupDiff = GROUP_ORDER[getAccountPickerGroup(a.section)]
      - GROUP_ORDER[getAccountPickerGroup(b.section)];
    if (groupDiff !== 0) return groupDiff;
    const labelDiff = collator.compare(a.label, b.label);
    return labelDiff !== 0 ? labelDiff : a.key.localeCompare(b.key);
  });
};
