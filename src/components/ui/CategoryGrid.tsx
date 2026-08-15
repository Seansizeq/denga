import React, { useRef, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { CATEGORIES, inferCustomCategoryColor, inferCustomCategoryIcon } from '../../constants/categories';
import { getCategoryIcon } from '../../constants/categoryIcons';
import { useTranslation } from '../../i18n/LanguageContext';
import type { CategoryKey } from '../../i18n/translations';
import styles from './CategoryGrid.module.css';

const LONG_PRESS_MS = 500;

export interface ManageableCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  isCustom: boolean;
}

interface CategoryGridProps {
  selectedId: string;
  type: 'income' | 'expense';
  onSelect: (id: string) => void;
  onAddCustom?: () => void;
  customCategories?: Array<{ id: string; name: string; icon: string; color: string }>;
  categoryOverrides?: Record<string, { name?: string; icon?: string; color?: string }>;
  onManageCategory?: (category: ManageableCategory) => void;
}

interface CategoryButtonProps {
  selected: boolean;
  onSelect: () => void;
  onManage?: () => void;
  children: React.ReactNode;
}

const CategoryButton: React.FC<CategoryButtonProps> = ({ selected, onSelect, onManage, children }) => {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const clearTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerDown = () => {
    if (!onManage) return;
    longPressTriggered.current = false;
    clearTimer();
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onManage();
    }, LONG_PRESS_MS);
  };

  const handlePointerUp = () => {
    clearTimer();
    if (!longPressTriggered.current) onSelect();
  };

  const handlePointerLeave = () => {
    clearTimer();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onManage) return;
    e.preventDefault();
    onManage();
  };

  return (
    <button
      type="button"
      className={`${styles.categoryBtn} ${selected ? styles.selected : ''}`}
      onClick={onManage ? undefined : onSelect}
      onPointerDown={onManage ? handlePointerDown : undefined}
      onPointerUp={onManage ? handlePointerUp : undefined}
      onPointerLeave={onManage ? handlePointerLeave : undefined}
      onPointerCancel={onManage ? handlePointerLeave : undefined}
      onContextMenu={onManage ? handleContextMenu : undefined}
    >
      {children}
    </button>
  );
};

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
  const filtered = CATEGORIES.filter((c) => c.type === type || c.type === 'both');
  const normalizeName = (value: string): string => value.trim().toLocaleLowerCase();
  const builtInNameSet = new Set<string>();
  for (const category of filtered) {
    const override = categoryOverrides[category.id] ?? {};
    const displayName = override.name?.trim() || t('categories', category.id as CategoryKey);
    builtInNameSet.add(normalizeName(displayName));
    for (const alias of category.aliases ?? []) {
      builtInNameSet.add(normalizeName(alias));
    }
  }
  const seenCustomNames = new Set<string>();

  return (
    <div className={styles.grid}>
      {filtered.map((category) => {
        const override = categoryOverrides[category.id] ?? {};
        const iconName = override.icon ?? category.icon;
        const iconColor = override.color ?? category.color;
        const displayName = override.name?.trim() || t('categories', category.id as CategoryKey);
        const IconComponent = getCategoryIcon(iconName, 'Circle');
        const selected = selectedId === category.id;
        const managePayload: ManageableCategory = {
          id: category.id,
          name: displayName,
          icon: iconName,
          color: iconColor,
          isCustom: false,
        };
        return (
          <CategoryButton
            key={category.id}
            selected={selected}
            onSelect={() => onSelect(category.id)}
            onManage={onManageCategory ? () => onManageCategory(managePayload) : undefined}
          >
            <div className={styles.iconBox}>
              <IconComponent size={24} color={iconColor} strokeWidth={1.5} />
            </div>
            <span className={styles.name}>{displayName}</span>
          </CategoryButton>
        );
      })}
      {customCategories.map((category) => {
        const normalized = normalizeName(category.name);
        if (!normalized) return null;
        if (builtInNameSet.has(normalized)) return null;
        if (seenCustomNames.has(normalized)) return null;
        seenCustomNames.add(normalized);
        const resolvedIcon = inferCustomCategoryIcon(category.name, category.icon);
        const resolvedColor = inferCustomCategoryColor(category.name, category.color);
        const IconComponent = getCategoryIcon(resolvedIcon, 'Tag');
        const selected = selectedId === category.id;
        const managePayload: ManageableCategory = {
          ...category,
          icon: resolvedIcon,
          color: resolvedColor,
          isCustom: true,
        };
        return (
          <CategoryButton
            key={category.id}
            selected={selected}
            onSelect={() => onSelect(category.id)}
            onManage={onManageCategory ? () => onManageCategory(managePayload) : undefined}
          >
            <div className={styles.iconBox}>
              <IconComponent size={24} color={resolvedColor} strokeWidth={1.5} />
            </div>
            <span className={styles.name}>{category.name}</span>
          </CategoryButton>
        );
      })}
      {onAddCustom ? (
        <button
          type="button"
          className={styles.categoryBtn}
          onClick={onAddCustom}
        >
          <div className={`${styles.iconBox} ${styles.addIconBox}`}>
            <Plus size={24} color="#FFD53B" strokeWidth={2} />
          </div>
          <span className={styles.name}>+</span>
        </button>
      ) : null}
    </div>
  );
};

export default CategoryGrid;
