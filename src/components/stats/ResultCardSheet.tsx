import React, { useMemo } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatSignedCurrency } from '../../utils/formatters';
import type { StatsRange } from '../../utils/statsPeriod';
import { resultValueColor, selectResultCardGroup } from '../../utils/resultCard';
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
  const formattedAmount = formatSignedCurrency(currentNet, locale, displayCurrency);
  const amount = !moneyHidden && currentNet > 0 ? `+${formattedAmount}` : formattedAmount;

  return (
    <ResultImageSheet
      open={open}
      onClose={onClose}
      sheetTitle={t('stats', 'resultImageTitle')}
      imageAlt={title}
      group={group}
      filenameKey={`${range}-${periodLabel}`}
      label={title}
      amount={amount}
      amountColor={moneyHidden ? '#050505' : resultValueColor(currentNet)}
    />
  );
};

export default ResultCardSheet;
