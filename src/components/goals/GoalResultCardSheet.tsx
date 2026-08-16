import React, { useMemo } from 'react';
import type { Goal } from '../../api/client';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatters';
import type { DisplayCurrency } from '../../utils/formatters';
import { selectGoalResultCardGroup } from '../../utils/resultCard';
import ResultImageSheet from '../stats/ResultImageSheet';

interface GoalResultCardSheetProps {
  open: boolean;
  onClose: () => void;
  goal: Goal;
}

const deadlineDays = (deadline: string | null): number | null => {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const end = new Date(`${deadline}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - now.getTime()) / 86_400_000);
};

const GoalResultCardSheet: React.FC<GoalResultCardSheetProps> = ({ open, onClose, goal }) => {
  const { t, locale } = useTranslation();
  const currency = goal.currency as DisplayCurrency;
  const rawProgress = goal.targetAmount > 0 ? Math.max(0, (goal.saved / goal.targetAmount) * 100) : 0;
  const progress = Math.round(rawProgress);
  const remaining = Math.max(0, goal.targetAmount - goal.saved);
  const days = deadlineDays(goal.deadline);
  const group = useMemo(
    () => selectGoalResultCardGroup({
      saved: goal.saved,
      target: goal.targetAmount,
      createdAt: goal.createdAt,
      deadline: goal.deadline,
    }),
    [goal.saved, goal.targetAmount, goal.createdAt, goal.deadline],
  );

  let period = `${t('goals', 'remaining')}: ${formatCurrency(remaining, locale, currency)}`;
  if (rawProgress >= 100) period = t('goals', 'goalReached');
  else if (days !== null) {
    period = days < 0
      ? t('goals', 'overdue')
      : t('goals', 'daysLeft').replace('{n}', String(days));
  }

  const negativeProgress = group === 'bad' || group === 'very-bad';

  return (
    <ResultImageSheet
      open={open}
      onClose={onClose}
      sheetTitle={t('goals', 'goalResultImageTitle')}
      imageAlt={`${t('goals', 'goalResultPrefix')}: ${goal.name}`}
      group={group}
      periodKey={`${goal.id}-${Math.floor(rawProgress / 10)}`}
      filenameKey={`goal-${goal.name}`}
      cardTitle={`${t('goals', 'goalResultPrefix')}: ${goal.name}`}
      amount={`${formatCurrency(goal.saved, locale, currency)} / ${formatCurrency(goal.targetAmount, locale, currency)}`}
      comparison={`${progress}% ${t('goals', 'goalCompletedShort')}`}
      period={period}
      amountColor={goal.saved > 0 ? '#16A34A' : '#050505'}
      comparisonColor={negativeProgress ? '#DC2626' : '#16A34A'}
    />
  );
};

export default GoalResultCardSheet;
