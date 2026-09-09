import React, { useMemo } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatSignedCurrency } from '../../utils/formatters';
import type { StatsRange } from '../../utils/statsPeriod';
import { resultValueColor, selectResultCardTier } from '../../utils/resultCard';
import ResultImageSheet from './ResultImageSheet';

interface ResultCardSheetProps {
  open: boolean;
  onClose: () => void;
  range: StatsRange;
  periodLabel: string;
  currentNet: number;
}

const ResultCardSheet: React.FC<ResultCardSheetProps> = ({
  open,
  onClose,
  range,
  periodLabel,
  currentNet,
}) => {
  const { t, locale, displayCurrency, moneyHidden, convertAmount } = useTranslation();
  // За схованих сум малюнка немає навмисно: щабель грошей сам по собі виказав
  // би, у якій сотні результат, і ховати цифру було б без сенсу.
  const tier = useMemo(
    () => (moneyHidden ? null : selectResultCardTier(convertAmount(currentNet, displayCurrency, 'USD'))),
    [moneyHidden, convertAmount, currentNet, displayCurrency],
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
      tier={tier}
      filenameKey={`${range}-${periodLabel}`}
      label={title}
      amount={amount}
      amountColor={moneyHidden ? '#ffffff' : resultValueColor(currentNet)}
    />
  );
};

export default ResultCardSheet;
