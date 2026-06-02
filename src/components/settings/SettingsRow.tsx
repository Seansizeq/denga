import React from 'react';
import { ChevronRight, Check } from 'lucide-react';
import styles from './SettingsRow.module.css';

interface SettingsRowProps {
  label: string;
  sublabel?: string;
  leading?: React.ReactNode;
  value?: React.ReactNode;
  trailing?: React.ReactNode;
  chevron?: boolean;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  emphasis?: boolean;
}

const SettingsRow: React.FC<SettingsRowProps> = ({
  label,
  sublabel,
  leading,
  value,
  trailing,
  chevron = false,
  selected = false,
  onClick,
  disabled = false,
  emphasis = false,
}) => {
  const content = (
    <>
      <div className={styles.left}>
        {leading ? <span className={styles.leading}>{leading}</span> : null}
        <span className={styles.labels}>
          <span className={`${styles.label} ${emphasis ? styles.labelEmphasis : ''}`}>{label}</span>
          {sublabel ? <span className={styles.sublabel}>{sublabel}</span> : null}
        </span>
      </div>
      <div className={styles.right}>
        {value !== undefined && value !== null ? <span className={styles.value}>{value}</span> : null}
        {trailing}
        {selected ? <Check size={18} strokeWidth={2.5} className={styles.check} /> : null}
        {chevron ? <ChevronRight size={18} strokeWidth={2} className={styles.chevron} /> : null}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={styles.row} onClick={onClick} disabled={disabled}>
        {content}
      </button>
    );
  }

  return <div className={`${styles.row} ${styles.rowStatic}`}>{content}</div>;
};

export default SettingsRow;
