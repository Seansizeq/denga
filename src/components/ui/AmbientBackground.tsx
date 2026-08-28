import React from 'react';
import styles from './AmbientBackground.module.css';

const AmbientBackground: React.FC = () => (
  <div className={styles.layer} aria-hidden="true">
    <div className={styles.blob1} />
    <div className={styles.blob2} />
    <div className={styles.blob3} />
  </div>
);

export default AmbientBackground;
