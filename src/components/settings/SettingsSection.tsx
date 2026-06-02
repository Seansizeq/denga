import React from 'react';
import styles from './SettingsSection.module.css';

interface SettingsSectionProps {
  label?: string;
  description?: string;
  children: React.ReactNode;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ label, description, children }) => (
  <section className={styles.section}>
    {label ? <div className={styles.label}>{label}</div> : null}
    <div className={styles.card}>{children}</div>
    {description ? <p className={styles.description}>{description}</p> : null}
  </section>
);

export default SettingsSection;
