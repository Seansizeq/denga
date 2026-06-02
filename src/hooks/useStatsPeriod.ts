import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '../i18n/LanguageContext';
import {
  createDefaultAnchors,
  formatPeriodLabel,
  getPeriodBounds,
  getPreviousPeriodBounds,
  isCurrentPeriod,
  shiftPeriod,
  toIsoDateParam,
  type PeriodAnchors,
  type StatsRange,
} from '../utils/statsPeriod';

const RANGES: readonly StatsRange[] = ['today', 'week', 'month', 'year'];

const parseRange = (value: string | null): StatsRange | null =>
  value && (RANGES as readonly string[]).includes(value) ? (value as StatsRange) : null;

const parseAnchorDate = (value: string | null): Date | null => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
};

const representativeDate = (range: StatsRange, anchors: PeriodAnchors): Date => {
  switch (range) {
    case 'today':
      return anchors.selectedDay;
    case 'week':
      return anchors.selectedWeek;
    case 'month':
      return anchors.selectedMonth;
    case 'year':
    default:
      return new Date(anchors.selectedYear, 0, 1);
  }
};

export interface UseStatsPeriodResult {
  range: StatsRange;
  setRange: (range: StatsRange) => void;
  anchors: PeriodAnchors;
  bounds: ReturnType<typeof getPeriodBounds>;
  previousBounds: ReturnType<typeof getPreviousPeriodBounds>;
  periodLabel: string;
  isCurrent: boolean;
  goPrev: () => void;
  goNext: () => void;
  goToCurrent: () => void;
}

export const useStatsPeriod = (): UseStatsPeriodResult => {
  const { locale } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [range, setRangeState] = useState<StatsRange>(
    () => parseRange(searchParams.get('range')) ?? 'month',
  );
  const [anchors, setAnchors] = useState<PeriodAnchors>(() =>
    createDefaultAnchors(parseAnchorDate(searchParams.get('anchor')) ?? new Date()),
  );

  const didMountRef = useRef(false);
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('range', range);
    next.set('anchor', toIsoDateParam(representativeDate(range, anchors)));
    setSearchParams(next, { replace: true });
    didMountRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, anchors]);

  const setRange = useCallback((next: StatsRange) => setRangeState(next), []);
  const goPrev = useCallback(() => setAnchors((prev) => shiftPeriod(range, prev, -1)), [range]);
  const goNext = useCallback(() => setAnchors((prev) => shiftPeriod(range, prev, 1)), [range]);
  const goToCurrent = useCallback(() => setAnchors(createDefaultAnchors(new Date())), []);

  const bounds = useMemo(() => getPeriodBounds(range, anchors), [range, anchors]);
  const previousBounds = useMemo(() => getPreviousPeriodBounds(range, anchors), [range, anchors]);
  const periodLabel = useMemo(() => formatPeriodLabel(range, anchors, locale), [range, anchors, locale]);
  const isCurrent = useMemo(() => isCurrentPeriod(range, anchors), [range, anchors]);

  return { range, setRange, anchors, bounds, previousBounds, periodLabel, isCurrent, goPrev, goNext, goToCurrent };
};
