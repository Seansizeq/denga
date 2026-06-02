import { findCategory, getCustomCategoryData } from '../../constants/categories';
import type { CategoryKey } from '../../i18n/translations';

export interface CategoryDisplay {
  color: string;
  name: string;
}

type CategoryTranslate = (section: 'categories', key: CategoryKey) => string;

export const resolveCategoryDisplay = (id: string, t: CategoryTranslate): CategoryDisplay => {
  const custom = getCustomCategoryData(id);
  if (custom) return { color: custom.color, name: custom.name };
  const category = findCategory(id);
  return { color: category.color, name: t('categories', category.id) };
};
