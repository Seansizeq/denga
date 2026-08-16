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

    return (
      <ResultImageSheet
        open={open}
        onClose={onClose}
        sheetTitle={t('goals', 'goalResultImageTitle')}
        imageAlt={`${label}: ${goal.name}`}
        group={periodGroup}
        filenameKey={`goal-${goal.name}-${scope}`}
        label={label}
        amount={`${periodEarned > 0 ? '+' : ''}${formatCurrency(periodEarned, locale, currency)}`}
        amountColor={periodEarned > 0 ? '#16A34A' : '#050505'}
      />
    );
  }

  return (
    <ResultImageSheet
      open={open}
      onClose={onClose}
      sheetTitle={t('goals', 'goalResultImageTitle')}
      imageAlt={`${t('goals', 'goalResultPrefix')}: ${goal.name}`}
      group={totalGroup}
      filenameKey={`goal-${goal.name}`}
      label={`${goal.name} — ${progress}% ${t('goals', 'goalCompletedShort')}`}
      amount={formatCurrency(goal.saved, locale, currency)}
      amountColor={goal.saved > 0 ? '#16A34A' : '#050505'}
    />
  );
};

export default GoalResultCardSheet;
