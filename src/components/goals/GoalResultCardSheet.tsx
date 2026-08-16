import React, { useMemo } from 'react';
import type { Goal } from '../../api/client';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatters';
import type { DisplayCurrency } from '../../utils/formatters';
import { selectGoalResultCardGroup, selectResultCardGroup } from '../../utils/resultCard';
import ResultImageSheet from '../stats/ResultImageSheet';

/** Що саме показує картинка: увесь забіг чи заробіток за один період. */
export type GoalResultScope = 'total' | 'today' | 'month';

interface GoalResultCardSheetProps {
  open: boolean;
  onClose: () => void;
  goal: Goal;
  scope?: GoalResultScope;
  /** Заробіток за період і за попередній такий самий — лише для scope !== 'total'. */
  periodEarned?: number;
  previousEarned?: number;
}

const deadlineDays = (deadline: string | null): number | null => {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const end = new Date(`${deadline}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - now.getTime()) / 86_400_000);
};

const GoalResultCardSheet: React.FC<GoalResultCardSheetProps> = ({
  open,
  onClose,
  goal,
  scope = 'total',
  periodEarned = 0,
  previousEarned = 0,
}) => {
  const { t, locale } = useTranslation();
  const currency = goal.currency as DisplayCurrency;
  const rawProgress = goal.targetAmount > 0 ? Math.max(0, (goal.saved / goal.targetAmount) * 100) : 0;
  const progress = Math.round(rawProgress);
  const remaining = Math.max(0, goal.targetAmount - goal.saved);
  const days = deadlineDays(goal.deadline);
  const totalGroup = useMemo(
    () => selectGoalResultCardGroup({
      saved: goal.saved,
      target: goal.targetAmount,
      createdAt: goal.createdAt,
      deadline: goal.deadline,
    }),
    [goal.saved, goal.targetAmount, goal.createdAt, goal.deadline],
  );

  // Картка періоду міряє сам заробіток проти попереднього такого ж відрізка,
  // тож бере ту саму оцінку, що й картки статистики, а не прогрес цілі.
  const periodGroup = useMemo(
    () => selectResultCardGroup(scope === 'month' ? 'month' : 'today', periodEarned, previousEarned),
    [scope, periodEarned, previousEarned],
  );

  if (scope !== 'total') {
    const label = t('goals', scope === 'month' ? 'earnedMonth' : 'earnedToday');
    const delta = periodEarned - previousEarned;
    const comparison =
      previousEarned > 0
        ? `${delta >= 0 ? '+' : '−'}${formatCurrency(Math.abs(delta), locale, currency)} ${t('stats', 'vsPreviousShort')}`
        : t('stats', 'noPreviousComparison');

    return (
      <ResultImageSheet
        open={open}
        onClose={onClose}
        sheetTitle={t('goals', 'goalResultImageTitle')}
        imageAlt={`${label}: ${goal.name}`}
        group={periodGroup}
        filenameKey={`goal-${goal.name}-${scope}`}
        cardLayout="goal"
        eyebrow={label}
        cardTitle={goal.name}
        amount={formatCurrency(periodEarned, locale, currency)}
        secondaryAmount={`${t('goals', 'goalOfTarget')} ${formatCurrency(goal.targetAmount, locale, currency)}`}
        comparison={comparison}
        period={`${t('goals', 'goalResultPrefix')}: ${progress}% ${t('goals', 'goalCompletedShort')}`}
        progress={rawProgress}
        amountColor={periodEarned > 0 ? '#16A34A' : '#050505'}
        comparisonColor={delta >= 0 ? '#16A34A' : '#DC2626'}
        periodColor="rgba(5, 5, 5, 0.52)"
      />
    );
  }

  let period = `${t('goals', 'remaining')}: ${formatCurrency(remaining, locale, currency)}`;
  if (rawProgress >= 100) period = t('goals', 'goalReached');
  else if (days !== null) {
    period = days < 0
      ? t('goals', 'overdue')
      : t('goals', 'daysLeft').replace('{n}', String(days));
  }

  const overdue = days !== null && days < 0 && rawProgress < 100;

  return (
    <ResultImageSheet
      open={open}
      onClose={onClose}
      sheetTitle={t('goals', 'goalResultImageTitle')}
      imageAlt={`${t('goals', 'goalResultPrefix')}: ${goal.name}`}
      group={totalGroup}
      filenameKey={`goal-${goal.name}`}
      cardLayout="goal"
      eyebrow={t('goals', 'goalResultEyebrow')}
      cardTitle={goal.name}
      amount={formatCurrency(goal.saved, locale, currency)}
      secondaryAmount={`${t('goals', 'goalOfTarget')} ${formatCurrency(goal.targetAmount, locale, currency)}`}
      comparison={`${progress}% ${t('goals', 'goalCompletedShort')}`}
      period={period}
      progress={rawProgress}
      amountColor={goal.saved > 0 ? '#16A34A' : '#050505'}
      comparisonColor="#16A34A"
      periodColor={overdue ? '#DC2626' : 'rgba(5, 5, 5, 0.52)'}
    />
  );
};

export default GoalResultCardSheet;
