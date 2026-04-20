import React from 'react';
import * as LucideIcons from 'lucide-react';
import { CATEGORIES } from '../../constants/categories';
import styles from './CategoryGrid.module.css';

interface CategoryGridProps {
  selectedId: string;
  type: 'income' | 'expense';
  onSelect: (id: string) => void;
}

const CategoryGrid: React.FC<CategoryGridProps> = ({ selectedId, type, onSelect }) => {
  const filteredCategories = CATEGORIES.filter(c => 
    type === 'income' ? c.id.includes('salary') || c.id.includes('income') : !c.id.includes('income') && !c.id.includes('salary')
  );

  return (
    <div className={styles.grid}>
      {filteredCategories.map(category => {
        const IconComponent = (LucideIcons as any)[category.icon];
        return (
          <button
            key={category.id}
            type="button"
            className={`${styles.categoryBtn} ${selectedId === category.id ? styles.selected : ''}`}
            onClick={() => onSelect(category.id)}
          >
            <div className={styles.iconBox} style={{ backgroundColor: category.color }}>
              <IconComponent size={24} color="white" />
            </div>
            <span className={styles.name}>{category.name}</span>
          </button>
        );
      })}
    </div>
  );
};

export default CategoryGrid;
