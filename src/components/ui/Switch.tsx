import React from 'react';
import styles from './Switch.module.css';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

const Switch: React.FC<SwitchProps> = ({ checked, onChange, disabled = false, ...rest }) => {
  const handleToggle = () => {
    if (disabled) return;
    onChange(!checked);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest['aria-label']}
      disabled={disabled}
      onClick={handleToggle}
      className={`${styles.switch} ${checked ? styles.switchOn : ''} ${
        disabled ? styles.switchDisabled : ''
      }`}
    >
      <span className={styles.thumb} />
    </button>
  );
};

export default Switch;
