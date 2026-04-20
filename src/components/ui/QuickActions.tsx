import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowUpRight, ArrowDown, Receipt } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from './QuickActions.module.css';

type Tone = 'income' | 'expense' | 'history' | 'transfer';

interface ActionItem {
  id: string;
  icon: LucideIcon;
  labelKey: string;
  tone: Tone;
  onPress: () => void;
}

const QuickActions: React.FC = () => {
  const navigate = useNavigate();

  const items: ActionItem[] = [
    {
      id: 'income',
      icon: Plus,
      labelKey: 'Дохід',
      tone: 'income',
      onPress: () => navigate('/add?type=income'),
    },
    {
      id: 'transfer',
      icon: ArrowUpRight,
      labelKey: 'Переказ',
      tone: 'transfer',
      onPress: () => navigate('/add'),
    },
    {
      id: 'expense',
      icon: ArrowDown,
      labelKey: 'Витрата',
      tone: 'expense',
      onPress: () => navigate('/add?type=expense'),
    },
    {
      id: 'history',
      icon: Receipt,
      labelKey: 'Історія',
      tone: 'history',
      onPress: () => navigate('/history'),
    },
  ];

  return (
    <div className={styles.row}>
      {items.map(({ id, icon: Icon, labelKey, tone, onPress }) => (
        <button
          key={id}
          type="button"
          className={`${styles.item} ${styles[tone]}`}
          onClick={onPress}
        >
          <span className={styles.circle}>
            <Icon size={24} strokeWidth={1.5} />
          </span>
          <span className={styles.label}>{labelKey}</span>
        </button>
      ))}
    </div>
  );
};

export default QuickActions;
