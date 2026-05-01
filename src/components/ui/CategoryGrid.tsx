import React from 'react';
import * as LucideIcons from 'lucide-react';
import { CATEGORIES, inferCustomCategoryIcon } from '../../constants/categories';
import { useTranslation } from '../../i18n/LanguageContext';
import type { CategoryKey } from '../../i18n/translations';
import styles from './CategoryGrid.module.css';

const iconRegistry = LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>>;

interface CategoryGridProps {
  selectedId: string;
  type: 'income' | 'expense';
  onSelect: (id: string) => void;
  onAddCustom?: () => void;
  customCategories?: Array<{ id: string; name: string; icon: string; color: string }>;
  categoryOverrides?: Record<string, { name?: string; icon?: string; color?: string }>;
  onManageCategory?: (category: { id: string; name: string; icon: string; color: string; isCustom: boolean }) => void;
}

const CategoryGrid: React.FC<CategoryGridProps> = ({
  selectedId,
  type,
  onSelect,
  onAddCustom,
  customCategories = [],
  categoryOverrides = {},
  onManageCategory,
}) => {
  const { t } = useTranslation();
  const filtered = CATEGORIES.filter((c) => c.type === type);
  const normalizeName = (value: string): string => value.trim().toLocaleLowerCase();
  const builtInNameSet = new Set(
    filtered.map((category) => {
      const override = categoryOverrides[category.id] ?? {};
      const displayName = override.name?.trim() || t('categories', category.id as CategoryKey);
      return normalizeName(displayName);
    })
  );
  const seenCustomNames = new Set<string>();

  return (
    <div className={styles.grid}>
      {filtered.map((category) => {
        const override = categoryOverrides[category.id] ?? {};
        const iconName = override.icon ?? category.icon;
        const iconColor = override.color ?? category.color;
        const displayName = override.name?.trim() || t('categories', category.id as CategoryKey);
        const IconComponent = iconRegistry[iconName] ?? LucideIcons.Circle;
        const selected = selectedId === category.id;
        return (
          <button
            key={category.id}
            type="button"
            className={`${styles.categoryBtn} ${selected ? styles.selected : ''}`}
            onClick={() => {
              onSelect(category.id);
              onManageCategory?.({
                id: category.id,
                name: displayName,
                icon: iconName,
                color: iconColor,
                isCustom: false,
              });
            }}
          >
            <div className={styles.iconBox}>
              <IconComponent size={24} color={iconColor} strokeWidth={1.5} />
            </div>
            <span className={styles.name}>{displayName}</span>
          </button>
        );
      })}
      {customCategories.map((category) => {
        const normalized = normalizeName(category.name);
        if (!normalized) return null;
        if (builtInNameSet.has(normalized)) return null;
        if (seenCustomNames.has(normalized)) return null;
        seenCustomNames.add(normalized);
        const resolvedIcon = inferCustomCategoryIcon(category.name, category.icon);
        const IconComponent = iconRegistry[resolvedIcon] ?? LucideIcons.Tag;
        const selected = selectedId === category.id;
        return (
          <button
            key={category.id}
            type="button"
            className={`${styles.categoryBtn} ${selected ? styles.selected : ''}`}
            onClick={() => {
              onSelect(category.id);
              onManageCategory?.({ ...category, icon: resolvedIcon, isCustom: true });
            }}
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
