import React from 'react';
import { Banknote, Coins, CreditCard, HandCoins, TrendingUp } from 'lucide-react';
import BottomSheet from './BottomSheet';
import styles from './SectionPickerSheet.module.css';

export type PickableSection = 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt';

const SECTIONS: Array<{
  id: PickableSection;
  label: string;
  Icon: React.FC<{ size: number; strokeWidth: number }>;
  colorClass: string;
}> = [
  { id: 'bank',   label: 'Карти',   Icon: CreditCard,  colorClass: styles.tileBank   },
  { id: 'cash',   label: 'Готівка', Icon: Banknote,    colorClass: styles.tileCash   },
  { id: 'crypto', label: 'Крипта',  Icon: Coins,       colorClass: styles.tileCrypto },
  { id: 'stocks', label: 'Акції',   Icon: TrendingUp,  colorClass: styles.tileStocks },
  { id: 'debt',   label: 'Борг',    Icon: HandCoins,   colorClass: styles.tileDebt   },
];

interface SectionPickerSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (section: PickableSection) => void;
}

const SectionPickerSheet: React.FC<SectionPickerSheetProps> = ({ open, onClose, onSelect }) => (
  <BottomSheet open={open} title="Тип рахунку" onClose={onClose} closeLabel="Закрити">
    <div className={styles.grid}>
      {SECTIONS.map(({ id, label, Icon, colorClass }) => (
        <button
          key={id}
          type="button"
          className={`${styles.tile} ${colorClass}`}
          onClick={() => { onClose(); onSelect(id); }}
        >
          <Icon size={28} strokeWidth={1.8} />
          <span className={styles.tileLabel}>{label}</span>
        </button>
      ))}
    </div>
  </BottomSheet>
);

export default SectionPickerSheet;
