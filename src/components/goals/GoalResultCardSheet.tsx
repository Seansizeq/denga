import React, { useMemo } from 'react';
import type { Goal } from '../../api/client';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatDeltaCurrency, formatSignedCurrency } from '../../utils/formatters';
import type { DisplayCurrency } from '../../utils/formatters';
import { selectResultCardTier } from '../../utils/resultCard';
import ResultImageSheet from '../stats/ResultImageSheet';

/** Що саме показує картинка: увесь забіг чи заробіток за один період. */
export type GoalResultScope = 'total' | 'today' | 'month';

interface GoalResultCardSheetProps {
  open: boolean;
  onClose: () => void;
  goal: Goal;
  scope?: GoalResultScope;
  /** Заробіток за період — лише для scope !== 'total'. */
  periodEarned?: number;
}

const GoalResultCardSheet: React.FC<GoalResultCardSheetProps> = ({
  open,
  onClose,
  goal,
  scope = 'total',
  periodEarned = 0,
}) => {
  const { t, locale, convertAmount } = useTranslation();
  const currency = goal.currency as DisplayCurrency;
  const rawProgress = goal.targetAmount > 0 ? Math.max(0, (goal.saved / goal.targetAmount) * 100) : 0;
  const progress = Math.round(rawProgress);
  // Обидві картки міряють гроші, а не прогрес: на загальній — скільки вже
  // зібрано, на періодній — скільки принесено за відрізок.
  const totalTier = useMemo(
    () => selectResultCardTier(convertAmount(goal.saved, currency, 'USD')),
    [convertAmount, goal.saved, currency],
  );
  const periodTier = useMemo(
    () => selectResultCardTier(convertAmount(periodEarned, currency, 'USD')),
    [convertAmount, periodEarned, currency],
  );

  if (scope !== 'total') {
    const label = t('goals', scope === 'month' ? 'movedMonth' : 'movedToday');

    return (
      <ResultImageSheet
        open={open}
        onClose={onClose}
        sheetTitle={t('goals', 'goalResultImageTitle')}
        imageAlt={`${label}: ${goal.name}`}
        tier={periodTier}
        filenameKey={`goal-${goal.name}-${scope}`}
        label={label}
        amount={formatDeltaCurrency(periodEarned, locale, currency)}
        amountColor={periodEarned > 0 ? '#16A34A' : periodEarned < 0 ? '#DC2626' : '#050505'}
      />
    );
  }

  return (
    <ResultImageSheet
      open={open}
      onClose={onClose}
      sheetTitle={t('goals', 'goalResultImageTitle')}
      imageAlt={`${t('goals', 'goalResultPrefix')}: ${goal.name}`}
      tier={totalTier}
      filenameKey={`goal-${goal.name}`}
      label={`${goal.name} — ${progress}% ${t('goals', 'goalCompletedShort')}`}
      amount={formatSignedCurrency(goal.saved, locale, currency)}
      amountColor={goal.saved > 0 ? '#16A34A' : goal.saved < 0 ? '#DC2626' : '#050505'}
    />
  );
};

export default GoalResultCardSheet;
