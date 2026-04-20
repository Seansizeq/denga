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

  return (
    <div
      className={styles.item}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDelete}
    >
      <div className={styles.iconWrapper} style={{ backgroundColor: category.color }}>
        <IconComponent size={20} color="white" />
      </div>
      <div className={styles.info}>
        <span className={styles.name}>{categoryName}</span>
        {transaction.note ? (
          <span className={styles.note}>{transaction.note}</span>
        ) : (
          <span className={styles.date}>{formatDate(transaction.date, locale)}</span>
        )}
      </div>
      <span
        className={`${styles.amount} ${
          transaction.type === 'income' ? styles.income : styles.expense
        }`}
      >
        {transaction.type === 'income' ? '+' : '−'}
        {formatCurrency(transaction.amount, locale)}
      </span>
    </div>
  );
};

export default TransactionItem;
