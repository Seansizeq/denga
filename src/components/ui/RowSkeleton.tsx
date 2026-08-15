import React from 'react';
import styles from './RowSkeleton.module.css';

interface RowSkeletonProps {
  /** Скільки рядків-заглушок показати. */
  count?: number;
}

/**
 * Заглушка списку на час першого завантаження. Показує ту саму форму, що
 * з'явиться потім (аватар, два рядки тексту, сума справа), тож перехід до
 * реальних даних не перебудовує екран — на відміну від слова «Завантаження…»,
 * яке нічого не обіцяє і стрибає.
 */
const RowSkeleton: React.FC<RowSkeletonProps> = ({ count = 3 }) => (
  <div className={styles.list} aria-hidden="true">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className={`${styles.row} motion-skeleton`} style={{ ['--i' as string]: i }}>
        <span className={styles.avatar} />
        <span className={styles.lines}>
          <span className={styles.lineWide} />
          <span className={styles.lineNarrow} />
        </span>
        <span className={styles.amount} />
      </div>
    ))}
  </div>
);

export default RowSkeleton;
