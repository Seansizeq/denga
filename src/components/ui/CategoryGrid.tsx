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
  customCategories?: Array<{ id: string; name: string }>;
}

const CategoryGrid: React.FC<CategoryGridProps> = ({
  selectedId,
  type,
  onSelect,
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
        const selected = selectedId === category.id;
        return (
          <button
            key={category.id}
            type="button"
            className={`${styles.categoryBtn} ${selected ? styles.selected : ''}`}
            onClick={() => onSelect(category.id)}
          >
            <div className={styles.iconBox}>
              <LucideIcons.Tag size={24} color="#8E8E93" strokeWidth={1.5} />
            </div>
            <span className={styles.name}>{category.name}</span>
          </button>
        );
      })}
    </div>
  );
};

export default CategoryGrid;
