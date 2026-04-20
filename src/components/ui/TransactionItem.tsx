import React from 'react';
import * as LucideIcons from 'lucide-react';
import type { Transaction } from '../../types';
import { findCategory } from '../../constants/categories';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useTranslation } from '../../i18n/LanguageContext';
import type { CategoryKey } from '../../i18n/translations';
import styles from './TransactionItem.module.css';

interface TransactionItemProps {
  transaction: Transaction;
  onDelete?: (id: string) => void;
}

const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, onDelete }) => {
  const { t, locale } = useTranslation();
  const category = findCategory(transaction.categoryId);
  const IconComponent = (LucideIcons as any)[category.icon] ?? LucideIcons.Circle;

  const handleDelete = () => {
    if (!onDelete) return;
    if (window.confirm(t('history', 'deleteConfirm'))) {
      onDelete(transaction.id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onDelete) return;
    e.preventDefault();
    handleDelete();
  };

  const categoryName = t('categories', category.id as CategoryKey);
  const subtitle = transaction.note?.trim() || formatDate(transaction.date, locale);
  const isIncome = transaction.type === 'income';

  return (
    <div
      className={styles.row}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDelete}
    >
      <div className={styles.iconCircle}>
        <IconComponent size={22} color={category.color} strokeWidth={2} />
      </div>

      <div className={styles.info}>
        <span className={styles.name}>{categoryName}</span>
        <span className={styles.subtitle}>{subtitle}</span>
      </div>

      <div className={styles.right}>
        <span className={styles.amount}>
          {formatCurrency(transaction.amount, locale)}
        </span>
        <span
          className={`${styles.delta} ${isIncome ? styles.income : styles.expense}`}
        >
          {isIncome ? '+' : '−'}
          {formatCurrency(transaction.amount, locale)}
        </span>
      </div>
    </div>
  );
};

export default TransactionItem;
