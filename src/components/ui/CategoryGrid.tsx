import React from 'react';
import { getCategoryIcon } from '../../constants/categoryIcons';
import type { CatalogCategory } from '../../hooks/useCategoryCatalog';
import styles from './CategoryGrid.module.css';

interface CategoryGridProps {
  selectedId: string;
  /**
   * Already resolved and ordered by useCategoryCatalog: renames, icons, colors
   * and the order the user set in Settings → Categories. Adding or editing a
   * category happens there, so this grid only picks one.
   */
  categories: CatalogCategory[];
  onSelect: (id: string) => void;
}

const CategoryGrid: React.FC<CategoryGridProps> = ({ selectedId, categories, onSelect }) => (
  <div className={styles.grid}>
    {categories.map((category) => {
      const IconComponent = getCategoryIcon(category.icon, category.isCustom ? 'Tag' : 'Circle');
      return (
        <button
          key={category.id}
          type="button"
          className={`${styles.categoryBtn} ${selectedId === category.id ? styles.selected : ''}`}
          onClick={() => onSelect(category.id)}
        >
          <div className={styles.iconBox}>
            <IconComponent size={24} color={category.color} strokeWidth={1.5} />
          </div>
          <span className={styles.name}>{category.name}</span>
        </button>
      );
    })}
  </div>
);

export default CategoryGrid;
