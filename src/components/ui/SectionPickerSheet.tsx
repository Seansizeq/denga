import React from 'react';
import { Banknote, Coins, CreditCard, HandCoins, TrendingUp } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { useTranslation } from '../../i18n/LanguageContext';
import styles from './SectionPickerSheet.module.css';

export type PickableSection = 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt';

/** Підписи беруться з тих самих ключів, що й розділи гаманця. */
const SECTIONS: Array<{
  id: PickableSection;
  labelKey: 'sectionBank' | 'sectionCash' | 'sectionCrypto' | 'sectionStocks' | 'sectionDebt';
  Icon: React.FC<{ size: number; strokeWidth: number }>;
  colorClass: string;
}> = [
  { id: 'bank',   labelKey: 'sectionBank',   Icon: CreditCard, colorClass: styles.tileBank   },
  { id: 'cash',   labelKey: 'sectionCash',   Icon: Banknote,   colorClass: styles.tileCash   },
  { id: 'crypto', labelKey: 'sectionCrypto', Icon: Coins,      colorClass: styles.tileCrypto },
  { id: 'stocks', labelKey: 'sectionStocks', Icon: TrendingUp, colorClass: styles.tileStocks },
  { id: 'debt',   labelKey: 'sectionDebt',   Icon: HandCoins,  colorClass: styles.tileDebt   },
];

interface SectionPickerSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (section: PickableSection) => void;
}

const SectionPickerSheet: React.FC<SectionPickerSheetProps> = ({ open, onClose, onSelect }) => {
  const { t } = useTranslation();

  return (
    <BottomSheet
      open={open}
      title={t('balance', 'accountTypeTitle')}
      onClose={onClose}
      closeLabel={t('addTx', 'cancel')}
    >
      <div className={styles.grid}>
        {SECTIONS.map(({ id, labelKey, Icon, colorClass }) => (
          <button
            key={id}
            type="button"
            className={`${styles.tile} ${colorClass}`}
            onClick={() => { onClose(); onSelect(id); }}
          >
            <Icon size={28} strokeWidth={1.8} />
            <span className={styles.tileLabel}>{t('balance', labelKey)}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
};

export default SectionPickerSheet;
