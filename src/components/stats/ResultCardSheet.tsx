import React, { useMemo } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatSignedCurrency } from '../../utils/formatters';
import type { StatsRange } from '../../utils/statsPeriod';
import { calculateResultChange, resultValueColor, selectResultCardGroup } from '../../utils/resultCard';
import ResultImageSheet from './ResultImageSheet';

interface ResultCardSheetProps {
  open: boolean;
  onClose: () => void;
  range: StatsRange;
  periodLabel: string;
  currentNet: number;
  previousNet: number;
}

const ResultCardSheet: React.FC<ResultCardSheetProps> = ({
  open,
  onClose,
  range,
  periodLabel,
  currentNet,
  previousNet,
}) => {
  const { t, locale, displayCurrency, moneyHidden } = useTranslation();
  const group = useMemo(
    () => selectResultCardGroup(range, currentNet, previousNet),
    [range, currentNet, previousNet],
  );
  const title = useMemo(() => {
    if (range === 'today') return t('stats', 'resultDay');
    if (range === 'week') return t('stats', 'resultWeek');
    if (range === 'month') return t('stats', 'resultMonth');
    return t('stats', 'resultYear');
  }, [range, t]);
  const resultChange = useMemo(
    () => calculateResultChange(currentNet, previousNet),
    [currentNet, previousNet],
  );
  const comparison = useMemo(() => {
    if (resultChange === null) return t('stats', 'noPreviousComparison');
    const rounded = Math.round(resultChange);
    const sign = rounded > 0 ? '+' : '';
    return `${sign}${rounded}% ${t('stats', 'vsPreviousShort')}`;
  }, [resultChange, t]);
  const formattedAmount = formatSignedCurrency(currentNet, locale, displayCurrency);
  const amount = !moneyHidden && currentNet > 0 ? `+${formattedAmount}` : formattedAmount;

  return (
    <ResultImageSheet
      open={open}
      onClose={onClose}
      sheetTitle={t('stats', 'resultImageTitle')}
      imageAlt={title}
      group={group}
      periodKey={periodLabel}
      filenameKey={`${range}-${periodLabel}`}
      cardTitle={title}
      amount={amount}
      comparison={comparison}
      period={periodLabel}
      amountColor={moneyHidden ? '#050505' : resultValueColor(currentNet)}
      comparisonColor={moneyHidden || resultChange === null ? '#050505' : resultValueColor(resultChange)}
    />
  );
};

export default ResultCardSheet;
