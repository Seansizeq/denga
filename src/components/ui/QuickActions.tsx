import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowDown, History, CreditCard, ScanLine } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import styles from './QuickActions.module.css';

type Tone = 'income' | 'expense' | 'history' | 'subscriptions' | 'scan';

interface ActionItem {
  id: string;
  icon: LucideIcon;
  labelKey: string;
  tone: Tone;
  onPress: () => void;
}

const QuickActions: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const items: ActionItem[] = [
    {
      id: 'income',
      icon: Plus,
      labelKey: t('quickActions', 'income'),
      tone: 'income',
      onPress: () => navigate('/add?type=income'),
    },
    {
      id: 'scan',
      icon: ScanLine,
      labelKey: t('quickActions', 'scan'),
      tone: 'scan',
      onPress: () => navigate('/scan'),
    },
    {
      id: 'history',
      icon: History,
      labelKey: t('quickActions', 'history'),
      tone: 'history',
      onPress: () => navigate('/history'),
    },
    {
      id: 'subscriptions',
      icon: CreditCard,
      labelKey: t('quickActions', 'subscriptions'),
      tone: 'subscriptions',
      onPress: () => navigate('/subscriptions'),
    },
    {
      id: 'expense',
      icon: ArrowDown,
      labelKey: t('quickActions', 'expense'),
      tone: 'expense',
      onPress: () => navigate('/add?type=expense'),
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
