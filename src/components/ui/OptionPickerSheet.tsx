import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import BottomSheet from './BottomSheet';
import styles from './OptionPickerSheet.module.css';

export type PickerOption = {
  id: string;
  label: string;
  hint?: string;
  leading?: React.ReactNode;
  group?: string;
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
        {visibleOptions.map((option, index) => {
          const active = option.id === selectedId;
          const showGroup = Boolean(option.group && option.group !== visibleOptions[index - 1]?.group);
          return (
            <React.Fragment key={option.id}>
              {showGroup ? <li className={styles.groupLabel}>{option.group}</li> : null}
              <li>
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
            </React.Fragment>
          );
        })}
      </ul>
    </BottomSheet>
  );
};

export default OptionPickerSheet;
