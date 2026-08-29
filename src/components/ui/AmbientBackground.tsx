import React from 'react';
import styles from './AmbientBackground.module.css';

const AmbientBackground: React.FC = () => (
  <div className={styles.layer} aria-hidden="true">
    {/* `.blob` несе `position: absolute` — без нього пляма стає звичайним
        блоком і ігнорує всі top/left/bottom/right. */}
    <div className={`${styles.blob} ${styles.blob1}`} />
  </div>
);

export default AmbientBackground;
