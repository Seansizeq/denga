import React from 'react';
import * as LucideIcons from 'lucide-react';
import { CATEGORIES } from '../../constants/categories';
import { useTranslation } from '../../i18n/LanguageContext';
import type { CategoryKey } from '../../i18n/translations';
import styles from './CategoryGrid.module.css';

interface CategoryGridProps {
  selectedId: string;
  type: 'income' | 'expense';
  onSelect: (id: string) => void;
  onAddCustom?: () => void;
  customCategories?: Array<{ id: string; name: string; icon: string; color: string }>;
}

const CategoryGrid: React.FC<CategoryGridProps> = ({
  selectedId,
  type,
  onSelect,
  onAddCustom,
  customCategories = [],
}) => {
  const { t } = useTranslation();
  const filtered = CATEGORIES.filter((c) => c.type === type);

  return (
    <div className={styles.grid}>
      {filtered.map((category) => {
        const IconComponent = (LucideIcons as any)[category.icon] ?? LucideIcons.Circle;
        const selected = selectedId === category.id;
        return (
          <button
            key={category.id}
            type="button"
            className={`${styles.categoryBtn} ${selected ? styles.selected : ''}`}
            onClick={() => onSelect(category.id)}
          >
            <div className={styles.iconBox}>
              <IconComponent size={24} color={category.color} strokeWidth={1.5} />
            </div>
            <span className={styles.name}>
              {t('categories', category.id as CategoryKey)}
            </span>
          </button>
        );
      })}
      {customCategories.map((category) => {
        const IconComponent =
          (LucideIcons as any)[category.icon] ?? LucideIcons.Tag;
        const selected = selectedId === category.id;
        return (
          <button
            key={category.id}
            type="button"
            className={`${styles.categoryBtn} ${selected ? styles.selected : ''}`}
            onClick={() => onSelect(category.id)}
          >
            <div className={styles.iconBox}>
              <IconComponent size={24} color={category.color} strokeWidth={1.5} />
            </div>
            <span className={styles.name}>{category.name}</span>
          </button>
        );
      })}
      <button
        type="button"
        className={styles.categoryBtn}
        onClick={onAddCustom}
      >
        <div className={`${styles.iconBox} ${styles.addIconBox}`}>
          <LucideIcons.Plus size={24} color="#FFD53B" strokeWidth={2} />
        </div>
        <span className={styles.name}>+</span>
      </button>
    </div>
  );
};

export default CategoryGrid;
