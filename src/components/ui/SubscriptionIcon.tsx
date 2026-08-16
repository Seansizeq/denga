import React from 'react';
import { findCategory, getCustomCategoryData, inferCustomCategoryIcon } from '../../constants/categories';
import { getCategoryIcon } from '../../constants/categoryIcons';
import { findCatalogService, type CatalogService } from '../../constants/subscriptionCatalog';
import styles from './SubscriptionIcon.module.css';

/**
 * Чи колір бренду настільки темний, що на темному тлі застосунку зникне.
 * Apple, X і Notion офіційно чорні — для них міняємо місцями коло і логотип,
 * як це робить сама iOS у темній темі.
 */
const isTooDark = (hex: string): boolean => {
  const value = hex.replace('#', '');
  if (value.length !== 6) return false;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.22;
};

interface SubscriptionIconProps {
  /** Назва підписки — за нею шукається сервіс у каталозі. */
  name: string;
  categoryId: string;
  /** Діаметр кола. */
  size?: number;
  /** Готовий сервіс, якщо його вже знайшли (списки, чіпи вибору). */
  service?: CatalogService | null;
  /** Значок, вибраний користувачем вручну — має пріоритет над каталогом і категорією. */
  icon?: string | null;
  color?: string | null;
}

const SubscriptionIcon: React.FC<SubscriptionIconProps> = ({
  name,
  categoryId,
  size = 46,
  service: serviceProp,
  icon: customIcon,
  color: customColor,
}) => {
  const service = serviceProp !== undefined ? serviceProp : findCatalogService(name);
  const glyph = Math.round(size * 0.48);

  if (customIcon) {
    const CustomIconComponent = getCategoryIcon(customIcon, 'Tag');
    const background = customColor || '#8E8E93';
    return (
      <span className={styles.circle} style={{ width: size, height: size, background }}>
        {/* eslint-disable-next-line react-hooks/static-components */}
        <CustomIconComponent size={glyph} color="#fff" strokeWidth={2} />
      </span>
    );
  }

  if (service) {
    const inverted = isTooDark(service.color);
    const background = inverted ? '#f4f4f6' : service.color;
    const foreground = inverted ? service.color : '#ffffff';

    return (
      <span className={styles.circle} style={{ width: size, height: size, background }}>
        {service.path ? (
          <svg
            width={glyph}
            height={glyph}
            viewBox="0 0 24 24"
            fill={foreground}
            aria-hidden="true"
            focusable="false"
          >
            <path d={service.path} />
          </svg>
        ) : (
          <span
            className={styles.monogram}
            style={{ color: foreground, fontSize: Math.round(size * 0.42) }}
          >
            {service.name.slice(0, 1)}
          </span>
        )}
      </span>
    );
  }

  const customCategory = getCustomCategoryData(categoryId);
  const iconName = customCategory
    ? inferCustomCategoryIcon(customCategory.name, customCategory.icon)
    : findCategory(categoryId).icon;
  const color = customCategory?.color ?? findCategory(categoryId).color;
  const IconComponent = getCategoryIcon(iconName, 'Receipt');

  return (
    <span className={styles.circle} style={{ width: size, height: size, background: color }}>
      {/* Вибірка зі статичної таблиці іконок, а не створений тут компонент. */}
      {/* eslint-disable-next-line react-hooks/static-components */}
      <IconComponent size={glyph} color="#fff" strokeWidth={2} />
    </span>
  );
};

export default SubscriptionIcon;
