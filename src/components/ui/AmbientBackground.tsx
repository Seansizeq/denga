import React from 'react';
import styles from './AmbientBackground.module.css';

const AmbientBackground: React.FC = () => (
  <div className={styles.layer} aria-hidden="true">
    {/* `.blob` несе `position: absolute` — без нього плями стають звичайними
        блоками й стають стовпчиком, ігноруючи всі top/left/bottom/right. */}
    <div className={`${styles.blob} ${styles.blob1}`} />
    <div className={`${styles.blob} ${styles.blob2}`} />
    <div className={`${styles.blob} ${styles.blob3}`} />
  </div>
);

export default AmbientBackground;
