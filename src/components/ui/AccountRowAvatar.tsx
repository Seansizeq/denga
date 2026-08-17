import React from 'react';
import { AccountIconGlyph, resolveAccountIconKey } from '../../utils/accountIcons';
import styles from './AccountsSnapshot.module.css';

export type RowIconTone = 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt' | 'goal' | 'neutral';
type RowSection = 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt' | 'goal';

const iconToneClass = (tone: RowIconTone) => {
  if (tone === 'cash') return styles.iconCash;
  if (tone === 'crypto') return styles.iconCrypto;
  if (tone === 'stocks') return styles.iconStocks;
  if (tone === 'debt') return styles.iconDebt;
  if (tone === 'bank') return styles.iconBank;
  if (tone === 'goal') return styles.iconGoal;
  return styles.iconNeutral;
};

const inferSectionFromTone = (tone: RowIconTone): RowSection => {
  if (tone === 'bank' || tone === 'cash' || tone === 'crypto' || tone === 'stocks' || tone === 'debt' || tone === 'goal')
    return tone;
  return 'bank';
};

export type AccountRowAvatarProps = {
  accountKey: string;
  iconTone: RowIconTone;
  section?: RowSection;
  iconKey?: string | null;
  cryptoSymbol?: string | null;
  glyphSize?: number;
  classNameCircle?: string;
};

export const AccountRowAvatar: React.FC<AccountRowAvatarProps> = ({
  accountKey,
  iconTone,
  section,
  iconKey,
  cryptoSymbol,
  glyphSize = 20,
  classNameCircle,
}) => {
  const tone: RowIconTone = iconTone ?? 'bank';
  const sec = section ?? inferSectionFromTone(tone);
  const resolved = resolveAccountIconKey(iconKey, accountKey, sec, cryptoSymbol);

  return (
    <div className={`${styles.iconCircle} ${classNameCircle ?? ''}`.trim()}>
      <span className={`${styles.icon} ${iconToneClass(tone)}`}>
        <AccountIconGlyph iconKey={resolved} size={glyphSize} strokeWidth={2.35} className={styles.iconSvg} />
      </span>
    </div>
  );
};
