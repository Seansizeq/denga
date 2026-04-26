import React from 'react';
import * as LucideIcons from 'lucide-react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Transaction } from '../../types';
import { findCategory, getCustomCategoryData } from '../../constants/categories';
import { formatCurrency, formatDate, getCurrencyFromNote } from '../../utils/formatters';
import { useTranslation } from '../../i18n/LanguageContext';
import type { CategoryKey } from '../../i18n/translations';
import styles from './TransactionItem.module.css';

const iconRegistry = LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>>;

interface TransactionItemProps {
  transaction: Transaction;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
}

const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, onDelete, onEdit }) => {
  const { t, locale, displayCurrency } = useTranslation();
  const customCategory = getCustomCategoryData(transaction.categoryId);
  const category = customCategory
    ? findCategory(transaction.type === 'income' ? 'other_income' : 'other_expense')
    : findCategory(transaction.categoryId);
  const IconComponent = customCategory
    ? (iconRegistry[customCategory.icon] ?? LucideIcons.Tag)
    : (iconRegistry[category.icon] ?? LucideIcons.Circle);

  const handleDelete = () => {
    if (!onDelete) return;
    if (window.confirm(t('history', 'deleteConfirm'))) {
      onDelete(transaction.id);
    }
  };

  const handleEdit = () => {
    if (!onEdit) return;
    onEdit(transaction.id);
  };

  const categoryName = customCategory?.name ?? t('categories', category.id as CategoryKey);
  const subtitle = transaction.note?.trim() || formatDate(transaction.date, locale);
  const isIncome = transaction.type === 'income';
  const txCurrency = getCurrencyFromNote(transaction.note) ?? displayCurrency;

  return (
    <div
      className={styles.row}
    >
      <div className={styles.iconCircle}>
        <IconComponent size={22} color={customCategory?.color ?? category.color} strokeWidth={2} />
      </div>

      <div className={styles.info}>
        <span className={styles.name}>{categoryName}</span>
        <span className={styles.subtitle}>{subtitle}</span>
      </div>

      <div className={styles.right}>
        <span
          className={`${styles.amount} ${isIncome ? styles.income : styles.expense}`}
        >
          {isIncome ? '+' : '−'}
          {formatCurrency(transaction.amount, locale, txCurrency)}
        </span>
        {(onEdit || onDelete) ? (
          <div className={styles.actions}>
            {onEdit ? (
              <button type="button" className={styles.actionBtn} onClick={handleEdit} aria-label={t('history', 'edit')}>
                <Pencil size={14} />
              </button>
            ) : null}
            {onDelete ? (
              <button type="button" className={styles.actionBtn} onClick={handleDelete} aria-label={t('history', 'delete')}>
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TransactionItem;
