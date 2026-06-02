import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import BottomSheet from './BottomSheet';
import styles from './OptionPickerSheet.module.css';

export type PickerOption = {
  id: string;
  label: string;
  hint?: string;
  leading?: React.ReactNode;
};

interface OptionPickerSheetProps {
  open: boolean;
  title: string;
  options: PickerOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  closeLabel?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}

const OptionPickerSheet: React.FC<OptionPickerSheetProps> = ({
  open,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
  closeLabel,
  searchable = false,
  searchPlaceholder,
}) => {
  const [query, setQuery] = useState('');

  const visibleOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLocaleLowerCase();
    return options.filter(
      (option) =>
        option.label.toLocaleLowerCase().includes(q) ||
        option.hint?.toLocaleLowerCase().includes(q),
    );
  }, [options, query, searchable]);

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  return (
    <BottomSheet open={open} title={title} onClose={handleClose} closeLabel={closeLabel}>
      {searchable ? (
        <input
          type="search"
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
        />
      ) : null}
      <ul className={styles.list}>
        {visibleOptions.map((option) => {
          const active = option.id === selectedId;
          return (
            <li key={option.id}>
              <button
                type="button"
                className={`${styles.item} ${active ? styles.itemActive : ''}`}
                onClick={() => onSelect(option.id)}
              >
                <span className={styles.itemMain}>
                  {option.leading ? <span className={styles.leading}>{option.leading}</span> : null}
                  <span className={styles.labels}>
                    <span className={styles.label}>{option.label}</span>
                    {option.hint ? <span className={styles.hint}>{option.hint}</span> : null}
                  </span>
                </span>
                {active ? <Check size={18} strokeWidth={2.5} className={styles.check} /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
};

export default OptionPickerSheet;
