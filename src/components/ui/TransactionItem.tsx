import React from 'react';
import * as LucideIcons from 'lucide-react';
import type { Transaction } from '../../types';
import { CATEGORIES } from '../../constants/categories';
import { formatCurrency, formatDate } from '../../utils/formatters';
import styles from './TransactionItem.module.css';

interface TransactionItemProps {
  transaction: Transaction;
  onDelete?: (id: string) => void;
}

const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, onDelete }) => {
  const category = CATEGORIES.find(c => c.id === transaction.categoryId) || CATEGORIES[CATEGORIES.length - 1];
  const IconComponent = (LucideIcons as any)[category.icon];

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onDelete) {
      e.preventDefault();
      if (window.confirm('Видалити цю операцію?')) {
        onDelete(transaction.id);
      }
    }
  };

  return (
    <div className={styles.item} onContextMenu={handleContextMenu}>
      <div className={styles.iconWrapper} style={{ backgroundColor: category.color }}>
        <IconComponent size={20} color="white" />
      </div>
      <div className={styles.info}>
        <span className={styles.name}>{category.name}</span>
        <span className={styles.date}>{formatDate(transaction.date)}</span>
      </div>
      <span className={`${styles.amount} ${transaction.type === 'income' ? styles.income : styles.expense}`}>
        {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
      </span>
    </div>
  );
};

export default TransactionItem;
