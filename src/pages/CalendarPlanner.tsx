import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { formatPlannerMoney, type PlannerCurrency } from '../utils/formatters';
import type { RangeFilter } from '../components/ui/RecentTransactions';
import {
  apiFetch,
  getPlannerSettings,
} from '../api/client';
import { hapticLight, hapticResult, showAppAlert, showAppConfirm } from '../utils/notify';
import { buildPastDays, isWithinLastDays } from '../utils/dateRanges';
import ShiftFormSheet, {
  type ShiftFormPayload,
  type ShiftFormValue,
} from '../components/ui/ShiftFormSheet';
import { formatHoursMinutes, formatTimeRange } from '../utils/shiftDuration';
import styles from './CalendarPlanner.module.css';

interface DayPlan {
  hasShift: boolean;
  shiftsCount?: number;
  workedHours: number;
  salaryRate: number;
  salaryAmount: number;
  salaryCurrency: PlannerCurrency;
  salaryAmountUah?: number;
  salaryAmountPln?: number;
  note: string;
}

type PlannerStore = Record<string, DayPlan>;

interface ShiftTemplate {
  id: string;
  name: string;
  symbol: string;
  isFullDay: boolean;
  startTime: string;
  endTime: string;
  workedHours: number;
  salaryRate: number;
  salaryAmount: number;
  salaryCurrency: PlannerCurrency;
}

type PlannerReportRange = RangeFilter | 'day' | 'custom';
interface ActiveShift {
  startedAt: string;
  startedDay: string;
  templateId: string | null;
  salaryRate: number;
  salaryAmount: number;
  salaryCurrency: PlannerCurrency;
  shiftNote: string;
}

interface ShiftEntry {
  id: string;
  day: string;
  startedAt: string;
  endedAt: string;
  /** `range` — тривалість рахується з часу, `hours` — названа прямо. */
  mode: 'range' | 'hours';
  startTime: string;
  endTime: string;
  workedHours: number;
  salaryRate: number;
  salaryAmount: number;
  salaryCurrency: PlannerCurrency;
  note: string;
}


const toIsoLocal = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseIsoLocal = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const todayIso = (): string => toIsoLocal(new Date());
const monthLabel = (value: string, locale: string): string => {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
};

const openNativeDatePicker = (input: (HTMLInputElement & { showPicker?: () => void }) | null): void => {
  if (!input) return;
  if (typeof input.showPicker === 'function') {
    input.showPicker();
    return;
  }
  input.focus();
  input.click();
};

const buildDaysForMonth = (monthValue: string): string[] => {
  const [year, month] = monthValue.split('-').map(Number);
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
};

/** Усі дні в довільному діапазоні [from, to] включно (YYYY-MM-DD). */
const buildDaysBetween = (from: string, to: string): string[] => {
  if (!from || !to || from > to) return [];
  const out: string[] = [];
  const end = parseIsoLocal(to);
  const cursor = parseIsoLocal(from);
  let guard = 0;
  while (cursor <= end && guard < 1500) {
    out.push(toIsoLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return out;
};

/** Усі дні календарного року (рік = рік вибраного місяця в планеру). */
const buildDaysForYear = (y: number): string[] => {
  const out: string[] = [];
  for (let m = 1; m <= 12; m += 1) {
    out.push(...buildDaysForMonth(`${y}-${String(m).padStart(2, '0')}`));
  }
  return out;
};

const buildCalendarCells = (monthValue: string): Array<string | null> => {
  const days = buildDaysForMonth(monthValue);
  const [year, month] = monthValue.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const mondayStartOffset = (firstDay.getDay() + 6) % 7;
  return [...Array.from({ length: mondayStartOffset }, () => null), ...days];
};

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

const parseNoteToNameSymbol = (note: string): { name: string; symbol: string } => {
  const raw = note.trim();
  if (!raw) return { name: '', symbol: '' };
  const parts = raw.split(/\s*•\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { name: parts[0], symbol: parts.slice(1).join(' • ') };
  }
  return { name: parts[0] ?? '', symbol: '' };
};

const shiftMonthValue = (value: string, delta: number): string => {
  const [year, month] = value.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const hueFromString = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
};

const dayTintStyle = (note: string): React.CSSProperties | undefined => {
  const { name, symbol } = parseNoteToNameSymbol(note);
  const key = `${name}|${symbol}`.trim();
  if (!key || key === '|') return undefined;
  const hue = hueFromString(key);
  return {
    background: `hsla(${hue}, 70%, 55%, 0.16)`,
    borderColor: `hsla(${hue}, 70%, 60%, 0.4)`,
  };
};

const formatElapsedShiftTime = (
  startedAt: string,
  unitLabels: { hours: string; minutes: string }
): string => {
  const startedMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startedMs)) return `0${unitLabels.hours} 0${unitLabels.minutes}`;
  const diffSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
  const hours = Math.floor(diffSec / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  return `${hours}${unitLabels.hours} ${minutes}${unitLabels.minutes}`;
};

const expectedPayForDay = (p: DayPlan): number => {
  if (!p.hasShift) return 0;
  if (p.salaryAmount > 0) return p.salaryAmount;
  if (p.salaryRate > 0 && p.workedHours > 0) return p.salaryRate * p.workedHours;
  return 0;
};

const readVisualOverlayBox = (): { top: number; height: number; keyboardOpen: boolean } => {
  const vv = window.visualViewport;
  if (!vv) {
    return { top: 0, height: window.innerHeight, keyboardOpen: false };
  }
  const obscured = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  return {
    top: vv.offsetTop,
    height: vv.height,
    keyboardOpen: obscured > 72,
  };
};

const CalendarPlanner: React.FC = () => {
  const { t, locale } = useTranslation();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(todayIso());
  const [store, setStore] = useState<PlannerStore>({});
  const [loading, setLoading] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [startShiftChooserOpen, setStartShiftChooserOpen] = useState(false);
  /** Аркуш дій по дню — те, що відкривається утриманням числа в календарі. */
  const [dayActionsOpen, setDayActionsOpen] = useState(false);
  /** Місяць, показаний у календарі всередині звіту — окремий від головного. */
  const [panelMonth, setPanelMonth] = useState(() => todayIso().slice(0, 7));
  /**
   * Перший торкнутий день діапазону. Поки він заповнений, наступний тап
   * закриває проміжок; після цього починається новий.
   */
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [, setVvRev] = useState(0);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [defaultShiftTemplateId, setDefaultShiftTemplateId] = useState<string | null>(null);
  const [reportRange, setReportRange] = useState<PlannerReportRange>('month');
  const [customFrom, setCustomFrom] = useState(() => `${todayIso().slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(() => todayIso());
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [activeShiftLoading, setActiveShiftLoading] = useState(false);
  /** Відкрита форма зміни: null — закрита, запис без id — нова. */
  const [shiftForm, setShiftForm] = useState<ShiftFormValue | null>(null);
  const [shiftFormDay, setShiftFormDay] = useState(todayIso());
  const [dayShiftEntries, setDayShiftEntries] = useState<ShiftEntry[]>([]);
  const [dayShiftEntriesLoading, setDayShiftEntriesLoading] = useState(false);
  const [reportShiftEntries, setReportShiftEntries] = useState<ShiftEntry[]>([]);
  const [reportShiftEntriesLoading, setReportShiftEntriesLoading] = useState(false);
  const monthInputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [shiftElapsedText, setShiftElapsedText] = useState('0г 0хв');

  const modalAnyOpen = chooserOpen || startShiftChooserOpen || dayActionsOpen;

  const overlayBox = modalAnyOpen ? readVisualOverlayBox() : null;

  const loadActiveShift = async () => {
    try {
      const response = await apiFetch('/api/planner/active-shift');
      if (response.ok) {
        const data = await response.json();
        setActiveShift(data);
      }
    } catch (e) {
      console.error('Failed to load active shift:', e);
    }
  };

  const reloadPlannerData = useCallback(async () => {
    setLoading(true);
    try {
      const yearQ = month.slice(0, 4);
      const q =
        reportRange === 'custom' && customFrom && customTo && customFrom <= customTo
          ? `from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`
          : reportRange === 'year'
            ? `year=${encodeURIComponent(yearQ)}`
            : `month=${encodeURIComponent(month)}`;
      const response = await apiFetch(`/api/planner?${q}`);
      if (!response.ok) throw new Error(`Planner load failed: ${response.status}`);
      const rows = (await response.json()) as Array<DayPlan & { day: string }>;
      const next: PlannerStore = {};
      for (const row of rows) {
        next[row.day] = {
          hasShift: Boolean(row.hasShift),
          shiftsCount: toNumber((row as { shiftsCount?: unknown }).shiftsCount),
          workedHours: toNumber(row.workedHours),
          salaryRate: toNumber(row.salaryRate),
          salaryAmount: toNumber(row.salaryAmount),
          salaryCurrency: row.salaryCurrency === 'PLN' ? 'PLN' : 'UAH',
          salaryAmountUah: toNumber((row as { salaryAmountUah?: unknown }).salaryAmountUah),
          salaryAmountPln: toNumber((row as { salaryAmountPln?: unknown }).salaryAmountPln),
          note: row.note ?? '',
        };
      }
      setStore(next);
    } catch (error) {
      console.error('Failed to load planner data:', error);
      setStore({});
    } finally {
      setLoading(false);
    }
  }, [month, reportRange, customFrom, customTo]);

  useEffect(() => {
    void loadActiveShift();
  }, []);

  useEffect(() => {
    if (!activeShift?.startedAt) {
      setShiftElapsedText(`0${t('planner', 'hoursShort')} 0${t('planner', 'minutesShort')}`);
      return;
    }
    const updateElapsed = () => {
      setShiftElapsedText(
        formatElapsedShiftTime(activeShift.startedAt, {
          hours: t('planner', 'hoursShort'),
          minutes: t('planner', 'minutesShort'),
        })
      );
    };
    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeShift?.startedAt, t]);

  const handleStartShift = async (template: ShiftTemplate | null) => {
    setActiveShiftLoading(true);
    try {
      const response = await apiFetch('/api/planner/active-shift/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          template
            ? {
                templateId: template.id,
                salaryRate: template.salaryRate,
                salaryAmount: template.salaryAmount,
                salaryCurrency: template.salaryCurrency,
                shiftNote: [template.name.trim(), template.symbol.trim()].filter(Boolean).join(' • '),
              }
            : {}
        ),
      });
      if (response.ok) {
        setStartShiftChooserOpen(false);
        await loadActiveShift();
      }
    } catch (e) {
      console.error('Start shift error:', e);
    } finally {
      setActiveShiftLoading(false);
    }
  };

  const handleEndShift = async () => {
    if (!(await showAppConfirm(t('planner', 'endShiftConfirm')))) return;
    setActiveShiftLoading(true);
    try {
      const response = await apiFetch('/api/planner/active-shift/end', {
        method: 'POST',
      });
      if (response.ok) {
        setActiveShift(null);
        await reloadPlannerData();
        await loadDayShiftEntries(selectedDay);
        await loadReportShiftEntries(reportDays);
      } else {
        console.error('End shift failed with status', response.status);
      }
    } catch (e) {
      console.error('End shift error:', e);
    } finally {
      setActiveShiftLoading(false);
    }
  };

  useEffect(() => {
    if (!modalAnyOpen) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const bump = () => setVvRev((n) => n + 1);
    bump();
    vv.addEventListener('resize', bump);
    vv.addEventListener('scroll', bump);
    return () => {
      vv.removeEventListener('resize', bump);
      vv.removeEventListener('scroll', bump);
    };
  }, [modalAnyOpen]);

  const calendarCells = useMemo(() => buildCalendarCells(month), [month]);
  const panelCells = useMemo(() => buildCalendarCells(panelMonth), [panelMonth]);
  const weekdays = useMemo(() => {
    const baseMonday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
        new Date(baseMonday.getFullYear(), baseMonday.getMonth(), baseMonday.getDate() + i)
      )
    );
  }, [locale]);

  const current = store[selectedDay] ?? {
    hasShift: false,
    workedHours: 0,
    salaryRate: 0,
    salaryAmount: 0,
    salaryCurrency: 'UAH' as PlannerCurrency,
    note: '',
  };

  const dayHasShift = Boolean(current.hasShift || current.note.trim());

  const reportDaysKey = useMemo(() => {
    const now = new Date();
    const reportYear = Number(month.split('-')[0]);
    const baseDays =
      reportRange === 'custom'
        ? buildDaysBetween(customFrom, customTo)
        : reportRange === 'year'
        ? buildDaysForYear(reportYear)
        : reportRange === 'day'
          ? [selectedDay]
        : reportRange === 'today'
          ? buildPastDays(1, now)
          : reportRange === 'week'
            ? buildPastDays(8, now)
            : buildDaysForMonth(month);
    const days = baseDays.filter((iso) => {
      const d = parseIsoLocal(iso);
      if (reportRange === 'custom') return true;
      if (reportRange === 'year') return true;
      if (reportRange === 'day') return iso === selectedDay;
      if (reportRange === 'today') return d.toDateString() === now.toDateString();
      if (reportRange === 'week') {
        return isWithinLastDays(iso, 7, now);
      }
      if (reportRange === 'month') return true;
      return false;
    });
    return days.join('|');
  }, [month, reportRange, selectedDay, customFrom, customTo]);
  const reportDays = reportDaysKey ? reportDaysKey.split('|') : [];

  const monthReport = useMemo(() => {
    const days = reportDaysKey ? reportDaysKey.split('|') : [];
    let totalHours = 0;
    let totalSalaryUah = 0;
    let totalSalaryPln = 0;
    let filledDays = 0;
    let totalShifts = 0;
    for (const day of days) {
      const p = store[day];
      if (!p?.hasShift) continue;
      filledDays += 1;
      totalShifts += Math.max(1, Math.floor(toNumber(p.shiftsCount)));
      totalHours += p.workedHours || 0;
      const payUah = p.salaryAmountUah ?? (p.salaryCurrency === 'UAH' ? expectedPayForDay(p) : 0);
      const payPln = p.salaryAmountPln ?? (p.salaryCurrency === 'PLN' ? expectedPayForDay(p) : 0);
      totalSalaryUah += payUah;
      totalSalaryPln += payPln;
    }
    return { totalHours, totalSalaryUah, totalSalaryPln, filledDays, totalShifts };
  }, [store, reportDaysKey]);

  /**
   * Стрічка змін за період.
   *
   * Раніше сюди домішувалися вигадані записи з рядків днів — для тих днів, де
   * зміна жила тільки в `planner_days`. Такий запис не можна було ні виправити,
   * ні видалити: кнопки на ньому ховалися за перевіркою id. Тепер кожна зміна —
   * справжній запис, тож і показувати нічого вигадувати не треба.
   */
  const reportShiftBanners = useMemo(
    () => [...reportShiftEntries].sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || ''))),
    [reportShiftEntries],
  );

  useEffect(() => {
    void reloadPlannerData();
  }, [reloadPlannerData]);

  const loadShiftTemplates = async () => {
    try {
      const response = await apiFetch('/api/planner/shift-templates');
      if (!response.ok) return;
      const rows = (await response.json()) as ShiftTemplate[];
      setShiftTemplates(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Failed to load shift templates:', error);
    }
  };

  useEffect(() => {
    void loadShiftTemplates();
  }, []);

  const loadPlannerSettings = async () => {
    try {
      const settings = await getPlannerSettings();
      setDefaultShiftTemplateId(settings.defaultShiftTemplateId ?? null);
    } catch (error) {
      console.error('Failed to load planner settings:', error);
    }
  };

  useEffect(() => {
    void loadPlannerSettings();
  }, []);

  const resolveDefaultStartTemplate = (): ShiftTemplate | null | undefined => {
    if (!defaultShiftTemplateId) return undefined;
    if (defaultShiftTemplateId === 'none') return null;
    return shiftTemplates.find((tpl) => tpl.id === defaultShiftTemplateId) ?? undefined;
  };

  const openStartShiftFlow = () => {
    const preset = resolveDefaultStartTemplate();
    if (preset === undefined) {
      setStartShiftChooserOpen(true);
      return;
    }
    void handleStartShift(preset);
  };

  /**
   * Вибір дня більше не перемикає звіт на цей день. Звітом керує власна
   * панель — інакше тап по календарю мовчки збивав би вибраний період.
   */
  const selectDay = (dayIso: string) => {
    setSelectedDay(dayIso);
  };

  /**
   * Тап по календарю всередині звіту. Перший — ставить обидва кінці на один
   * день (звіт одразу показує цей день), другий — розтягує проміжок. Порядок
   * не має значення: якщо другий тап раніший, кінці міняються місцями.
   */
  const pickRangeDay = (dayIso: string) => {
    if (!rangeAnchor) {
      setRangeAnchor(dayIso);
      setCustomFrom(dayIso);
      setCustomTo(dayIso);
      return;
    }
    const [from, to] = dayIso < rangeAnchor ? [dayIso, rangeAnchor] : [rangeAnchor, dayIso];
    setCustomFrom(from);
    setCustomTo(to);
    setRangeAnchor(null);
  };

  /** Пресети не окремі режими, а лише швидкий спосіб заповнити діапазон. */
  const applyRangePreset = (preset: 'week' | 'year') => {
    const today = todayIso();
    if (preset === 'week') {
      const from = parseIsoLocal(today);
      from.setDate(from.getDate() - 6);
      setCustomFrom(toIsoLocal(from));
      setCustomTo(today);
    } else {
      const year = today.slice(0, 4);
      setCustomFrom(`${year}-01-01`);
      setCustomTo(`${year}-12-31`);
    }
    setRangeAnchor(null);
    setPanelMonth(today.slice(0, 7));
  };

  /**
   * Утримання числа веде не одразу до шаблонів зміни, а до аркуша з вибором:
   * почати зміну зараз чи додати її за цей день. Раніше обидві дії стояли
   * окремими кнопками під календарем.
   */
  const openDayActions = (dayIso: string) => {
    setSelectedDay(dayIso);
    setDayActionsOpen(true);
  };

  const handleDayTouchStart = (dayIso: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      hapticLight();
      openDayActions(dayIso);
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDayClick = (dayIso: string) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    selectDay(dayIso);
  };

  const handleGridTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleGridTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
    cancelLongPress();
    setMonth((prev) => shiftMonthValue(prev, dx < 0 ? 1 : -1));
  };

  const loadDayShiftEntries = useCallback(async (dayIso: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) {
      setDayShiftEntries([]);
      return;
    }
    setDayShiftEntriesLoading(true);
    try {
      const response = await apiFetch(`/api/planner/${encodeURIComponent(dayIso)}/shifts`);
      if (!response.ok) {
        setDayShiftEntries([]);
        return;
      }
      const rows = (await response.json()) as ShiftEntry[];
      setDayShiftEntries(
        Array.isArray(rows)
          ? rows.map((row) => ({
              ...row,
              workedHours: toNumber(row.workedHours),
              salaryRate: toNumber(row.salaryRate),
              salaryAmount: toNumber(row.salaryAmount),
              salaryCurrency: row.salaryCurrency === 'PLN' ? 'PLN' : 'UAH',
              note: row.note ?? '',
            }))
          : []
      );
    } catch (error) {
      console.error('Failed to load day shift entries:', error);
      setDayShiftEntries([]);
    } finally {
      setDayShiftEntriesLoading(false);
    }
  }, []);

  const loadReportShiftEntries = useCallback(async (days: readonly string[]) => {
    if (!Array.isArray(days) || days.length === 0) {
      setReportShiftEntries([]);
      return;
    }
    const sorted = [...days].sort();
    const from = sorted[0];
    const to = sorted[sorted.length - 1];
    if (!from || !to) {
      setReportShiftEntries([]);
      return;
    }
    setReportShiftEntriesLoading(true);
    try {
      const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const response = await apiFetch(`/api/planner/shift-entries?${query}`);
      if (!response.ok) {
        setReportShiftEntries([]);
        return;
      }
      const rows = (await response.json()) as ShiftEntry[];
      setReportShiftEntries(
        Array.isArray(rows)
          ? rows.map((row) => ({
              ...row,
              workedHours: toNumber(row.workedHours),
              salaryRate: toNumber(row.salaryRate),
              salaryAmount: toNumber(row.salaryAmount),
              salaryCurrency: row.salaryCurrency === 'PLN' ? 'PLN' : 'UAH',
              note: row.note ?? '',
            }))
          : []
      );
    } catch (error) {
      console.error('Failed to load report shift entries:', error);
      setReportShiftEntries([]);
    } finally {
      setReportShiftEntriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!chooserOpen) return;
    void loadDayShiftEntries(selectedDay);
  }, [chooserOpen, selectedDay, loadDayShiftEntries]);

  useEffect(() => {
    const days = reportDaysKey ? reportDaysKey.split('|') : [];
    void loadReportShiftEntries(days);
  }, [reportDaysKey, loadReportShiftEntries]);

  const refreshAfterShiftEntryMutation = async (dayIso: string) => {
    const days = reportDaysKey ? reportDaysKey.split('|') : [];
    await reloadPlannerData();
    await loadReportShiftEntries(days);
    await loadDayShiftEntries(dayIso);
  };

  const deleteShiftTemplate = async (tpl: ShiftTemplate) => {
    if (!(await showAppConfirm(t('planner', 'deleteTemplateConfirm')))) return;
    try {
      const response = await apiFetch(`/api/planner/shift-templates/${encodeURIComponent(tpl.id)}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        void loadShiftTemplates();
        void loadPlannerSettings();
      }
    } catch (error) {
      console.error('Failed to delete shift template:', error);
    }
  };

  /**
   * Порожня форма для нової зміни.
   *
   * Значення за замовчуванням — звичайний денний проміжок, а не «вісім годин»:
   * час одразу видно й видно, що його можна змінити. Раніше на цьому місці була
   * форма **дня**, тож друга зміна за добу просто перезаписувала першу.
   */
  const openNewShift = (dayIso: string) => {
    setShiftFormDay(dayIso);
    setShiftForm({
      id: '',
      mode: 'range',
      startTime: '09:00',
      endTime: '17:00',
      workedHours: 8,
      salaryRate: 0,
      salaryAmount: 0,
      salaryCurrency: 'UAH',
      name: '',
      symbol: '',
    });
    setChooserOpen(false);
  };

  /** Нова зміна, заповнена шаблоном, — разом із його власним часом. */
  const openNewShiftFromTemplate = (dayIso: string, tpl: ShiftTemplate) => {
    const byRange = !tpl.isFullDay && Boolean(tpl.startTime && tpl.endTime);
    setShiftFormDay(dayIso);
    setShiftForm({
      id: '',
      mode: byRange ? 'range' : 'hours',
      startTime: tpl.startTime || '09:00',
      endTime: tpl.endTime || '17:00',
      workedHours: tpl.workedHours,
      salaryRate: tpl.salaryRate,
      salaryAmount: tpl.salaryAmount,
      salaryCurrency: tpl.salaryCurrency,
      name: tpl.name,
      symbol: tpl.symbol,
    });
    setChooserOpen(false);
  };

  /** Правка конкретної зміни — тієї, по якій торкнулися, а не «зміни дня». */
  const openEditShiftEntry = (entry: ShiftEntry) => {
    const { name, symbol } = parseNoteToNameSymbol(entry.note);
    setShiftFormDay(entry.day);
    setShiftForm({
      id: entry.id,
      mode: entry.mode === 'range' ? 'range' : 'hours',
      startTime: entry.startTime || '09:00',
      endTime: entry.endTime || '17:00',
      workedHours: entry.workedHours,
      salaryRate: entry.salaryRate,
      salaryAmount: entry.salaryAmount,
      salaryCurrency: entry.salaryCurrency,
      name,
      symbol,
    });
    setChooserOpen(false);
  };

  const submitShiftForm = async (payload: ShiftFormPayload) => {
    const editingId = shiftForm?.id ?? '';
    const body = {
      mode: payload.mode,
      startTime: payload.startTime,
      endTime: payload.endTime,
      workedHours: payload.workedHours,
      salaryRate: payload.salaryRate,
      salaryAmount: payload.salaryAmount,
      salaryCurrency: payload.salaryCurrency,
      name: payload.name,
      symbol: payload.symbol,
    };
    const response = await apiFetch(
      editingId
        ? `/api/planner/shifts/${encodeURIComponent(editingId)}`
        : `/api/planner/${encodeURIComponent(shiftFormDay)}/shifts`,
      {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    // Помилку видно у формі — інакше вона лишалася б у консолі, а людина
    // бачила б, що «зберегти» нічого не робить.
    if (!response.ok) throw new Error(`Save shift failed: ${response.status}`);

    if (!editingId && payload.saveAsTemplate && (payload.name || payload.symbol)) {
      await saveShiftTemplate(payload);
    }
    await refreshAfterShiftEntryMutation(shiftFormDay);
  };

  /**
   * Шаблон зберігається лише за явною згодою у формі.
   *
   * Раніше він створювався сам із будь-якої названої зміни, і список заростав
   * одноразовими підписами.
   */
  const saveShiftTemplate = async (payload: ShiftFormPayload) => {
    try {
      const response = await apiFetch('/api/planner/shift-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payload.name,
          symbol: payload.symbol,
          isFullDay: payload.mode === 'hours',
          startTime: payload.startTime || '09:00',
          endTime: payload.endTime || '17:00',
          workedHours: payload.workedHours,
          salaryRate: payload.salaryRate,
          salaryAmount: payload.salaryAmount,
          salaryCurrency: payload.salaryCurrency,
        }),
      });
      if (response.ok) {
        void loadShiftTemplates();
        void loadPlannerSettings();
      }
    } catch (error) {
      console.error('Failed to save shift template:', error);
    }
  };

  const deleteShiftEntry = async (entry: ShiftEntry) => {
    const response = await apiFetch(`/api/planner/shifts/${encodeURIComponent(entry.id)}`, {
      method: 'DELETE',
    });
    if (!response.ok && response.status !== 204) throw new Error(`Delete shift failed: ${response.status}`);
    await refreshAfterShiftEntryMutation(entry.day);
  };

  const handleDeleteReportShift = async (entry: ShiftEntry) => {
    if (!(await showAppConfirm(t('planner', 'deleteShiftEntryConfirm')))) return;
    try {
      await deleteShiftEntry(entry);
    } catch (error) {
      console.error('Failed to delete report shift:', error);
      hapticResult('error');
      showAppAlert(t('addTx', 'saveFailed'));
    }
  };
  const todayIsoStr = todayIso();
  const currentMonthLabel = monthLabel(month, locale);

  /**
   * Підпис того, за що саме показано звіт. Один день — просто дата; проміжок
   * усередині одного місяця не повторює назву місяця двічі.
   */
  const reportPeriodLabel = (() => {
    if (reportRange !== 'custom') return currentMonthLabel;
    if (!customFrom || !customTo) return '';
    const from = parseIsoLocal(customFrom);
    const to = parseIsoLocal(customTo);
    if (customFrom === customTo) {
      return from.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
    }
    if (customFrom.slice(0, 7) === customTo.slice(0, 7)) {
      return `${from.getDate()} – ${to.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}`;
    }
    const opts = { day: 'numeric', month: 'short' } as const;
    return `${from.toLocaleDateString(locale, opts)} – ${to.toLocaleDateString(locale, opts)}`;
  })();
  const selectedDayLabel = parseIsoLocal(selectedDay).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
  const selectedDayPay = expectedPayForDay(current);

  /**
   * Підпис зміни у списку: час, тривалість, гроші.
   *
   * Час тут головний — саме за ним дві зміни одного дня й відрізняються. Доки
   * списки показували лише години й суму, вибрати потрібну можна було навмання.
   */
  const describeShiftEntry = (entry: ShiftEntry): string => {
    const range = entry.mode === 'range' ? formatTimeRange(entry.startTime, entry.endTime) : '';
    const duration = formatHoursMinutes(entry.workedHours, {
      hours: t('planner', 'hoursShort'),
      minutes: t('planner', 'minutesShort'),
    });
    const pay = entry.salaryAmount > 0
      ? formatPlannerMoney(entry.salaryAmount, locale, entry.salaryCurrency)
      : '';
    return [range, duration, pay].filter(Boolean).join(' · ');
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('planner', 'title')}</h1>
        <p className={styles.subtitle}>{t('planner', 'subtitle')}</p>
      </header>

      <section className={styles.panel}>
        <div className={styles.monthRow}>
          <button
            type="button"
            className={styles.monthNavBtn}
            onClick={() => setMonth((prev) => shiftMonthValue(prev, -1))}
            aria-label={t('planner', 'prevMonth')}
          >
            <ChevronLeft size={18} />
          </button>
          <div className={styles.monthPickerWrap}>
            <button
              type="button"
              className={styles.monthPickerBtn}
              onClick={() => openNativeDatePicker(monthInputRef.current)}
            >
              {currentMonthLabel}
            </button>
            <input
              ref={monthInputRef}
              type="month"
              className={styles.monthInputNative}
              value={month}
              aria-label={t('planner', 'monthHint')}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={styles.monthNavBtn}
            onClick={() => setMonth((prev) => shiftMonthValue(prev, 1))}
            aria-label={t('planner', 'nextMonth')}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className={styles.weekdays}>
          {weekdays.map((dayName) => <span key={dayName} className={styles.weekday}>{dayName}</span>)}
        </div>

        <div
          className={styles.grid}
          onTouchStart={handleGridTouchStart}
          onTouchEnd={handleGridTouchEnd}
        >
          {calendarCells.map((dayIso, idx) => {
            if (!dayIso) return <span key={`empty-${idx}`} className={styles.emptyDay} aria-hidden="true" />;
            const dayNum = Number(dayIso.slice(-2));
            const isToday = dayIso === todayIsoStr;
            const isSelected = dayIso === selectedDay;
            const note = store[dayIso]?.note ?? '';
            const hasShift = Boolean(store[dayIso]?.hasShift);
            const hasData = Boolean(hasShift || store[dayIso]?.salaryAmount || note);
            const daySymbol = parseNoteToNameSymbol(note).symbol;
            const tintStyle = hasShift ? dayTintStyle(note) : undefined;
            return (
              <button
                key={dayIso}
                type="button"
                style={tintStyle}
                className={`${styles.day} ${isSelected ? styles.dayActive : ''} ${isToday ? styles.dayToday : ''}`}
                aria-current={isToday ? 'date' : undefined}
                onClick={() => handleDayClick(dayIso)}
                onTouchStart={(e) => handleDayTouchStart(dayIso, e)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
                /* Утримання є лише на дотику; правий клік дає ті самі дії там,
                   де є миша, інакше поза телефоном вони недосяжні зовсім. */
                onContextMenu={(e) => {
                  e.preventDefault();
                  openDayActions(dayIso);
                }}
              >
                <span className={styles.dayNum}>{dayNum}</span>
                {daySymbol ? <span className={styles.daySymbol}>{daySymbol}</span> : null}
                {hasData && <span className={styles.dot} />}
              </button>
            );
          })}
        </div>

        <div className={styles.reportCard}>
          <div className={styles.reportHeader}>
            <h3 className={styles.reportCardTitle}>{t('planner', 'report')}</h3>
            <div className={styles.reportModeSeg} role="tablist" aria-label={t('planner', 'report')}>
              {(['month', 'custom'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  role="tab"
                  aria-selected={reportRange === opt}
                  className={`${styles.reportModeBtn} ${reportRange === opt ? styles.reportModeBtnActive : ''}`}
                  onClick={() => {
                    setReportRange(opt);
                    if (opt === 'custom') {
                      setRangeAnchor(null);
                      setPanelMonth(customFrom ? customFrom.slice(0, 7) : month);
                    }
                  }}
                >
                  {t('range', opt)}
                </button>
              ))}
            </div>
          </div>

          <p className={styles.reportPeriod}>{reportPeriodLabel}</p>

          {reportRange === 'custom' ? (
            <div className={styles.rangePicker}>
              <div className={styles.rangePresets}>
                {(['week', 'year'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={styles.rangePresetBtn}
                    onClick={() => applyRangePreset(preset)}
                  >
                    {t('range', preset)}
                  </button>
                ))}
              </div>

              <div className={styles.rangeMonthNav}>
                <button
                  type="button"
                  className={styles.rangeNavBtn}
                  onClick={() => setPanelMonth((prev) => shiftMonthValue(prev, -1))}
                  aria-label={t('planner', 'prevMonth')}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className={styles.rangeMonthLabel}>{monthLabel(panelMonth, locale)}</span>
                <button
                  type="button"
                  className={styles.rangeNavBtn}
                  onClick={() => setPanelMonth((prev) => shiftMonthValue(prev, 1))}
                  aria-label={t('planner', 'nextMonth')}
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className={styles.rangeWeekdays}>
                {weekdays.map((dayName) => (
                  <span key={`rw-${dayName}`} className={styles.rangeWeekday}>{dayName}</span>
                ))}
              </div>

              <div className={styles.rangeGrid}>
                {panelCells.map((dayIso, idx) => {
                  if (!dayIso) {
                    return <span key={`re-${idx}`} className={styles.rangeEmpty} aria-hidden="true" />;
                  }
                  const inRange = Boolean(
                    customFrom && customTo && dayIso >= customFrom && dayIso <= customTo,
                  );
                  const isEdge = dayIso === customFrom || dayIso === customTo;
                  return (
                    <button
                      key={`rd-${dayIso}`}
                      type="button"
                      className={`${styles.rangeDay} ${inRange ? styles.rangeDayIn : ''} ${
                        isEdge ? styles.rangeDayEdge : ''
                      }`}
                      onClick={() => pickRangeDay(dayIso)}
                    >
                      {Number(dayIso.slice(-2))}
                    </button>
                  );
                })}
              </div>

              <p className={styles.rangeHint}>
                {rangeAnchor ? t('planner', 'rangeHintEnd') : t('planner', 'rangeHintStart')}
              </p>
            </div>
          ) : null}
          <div className={styles.reportStatsGrid}>
            <div className={styles.reportStatItem}>
              <span className={styles.reportLabel}>{t('planner', 'filledDays')}</span>
              <strong className={styles.reportValue}>{monthReport.filledDays}</strong>
              {monthReport.totalShifts !== monthReport.filledDays ? (
                <span className={styles.reportValueSub}>
                  {monthReport.totalShifts} {t('planner', 'shiftsShort')}
                </span>
              ) : null}
            </div>
            <div className={styles.reportStatItem}>
              <span className={styles.reportLabel}>{t('planner', 'reportHoursTotal')}</span>
              <strong className={styles.reportValue}>
                {formatHoursMinutes(monthReport.totalHours, {
                  hours: t('planner', 'hoursShort'),
                  minutes: t('planner', 'minutesShort'),
                })}
              </strong>
            </div>
          </div>

          <div className={styles.reportRows}>
            {monthReport.totalSalaryUah > 0 ? (
              <div className={styles.reportRow}>
                <span className={styles.reportLabel}>{t('planner', 'expectedSalaryUah')}</span>
                <strong className={styles.reportValue}>
                  {formatPlannerMoney(monthReport.totalSalaryUah, locale, 'UAH')}
                </strong>
              </div>
            ) : null}
            {monthReport.totalSalaryPln > 0 ? (
              <div className={styles.reportRow}>
                <span className={styles.reportLabel}>{t('planner', 'expectedSalaryPln')}</span>
                <strong className={styles.reportValue}>
                  {formatPlannerMoney(monthReport.totalSalaryPln, locale, 'PLN')}
                </strong>
              </div>
            ) : null}
            {monthReport.totalSalaryUah <= 0 && monthReport.totalSalaryPln <= 0 ? (
              <div className={styles.reportRow}>
                <span className={styles.reportLabel}>{t('planner', 'expectedSalary')}</span>
                <strong className={styles.reportValue}>{formatPlannerMoney(0, locale, 'UAH')}</strong>
              </div>
            ) : null}
          </div>
          <div className={styles.reportShiftSection}>
            <p className={styles.templateSectionLabel}>{t('planner', 'reportShiftBanners')}</p>
            {reportShiftEntriesLoading ? (
              <p className={styles.dayShiftsEmpty}>{t('common', 'loading')}</p>
            ) : reportShiftBanners.length === 0 ? (
              <p className={styles.dayShiftsEmpty}>{t('planner', 'reportShiftBannersEmpty')}</p>
            ) : (
              <ul className={styles.dayShiftsList} role="list">
                {reportShiftBanners.map((entry) => (
                  <li key={`report-${entry.id}`} className={styles.dayShiftRow}>
                    <span className={styles.dayShiftMain}>{entry.note || t('planner', 'shiftTitle')}</span>
                    <span className={styles.dayShiftMeta}>
                      {entry.day} ·{' '}
                      {formatHoursMinutes(entry.workedHours, {
                        hours: t('planner', 'hoursShort'),
                        minutes: t('planner', 'minutesShort'),
                      })}{' '}
                      ·{' '}
                      {entry.salaryAmount > 0 ? formatPlannerMoney(entry.salaryAmount, locale, entry.salaryCurrency) : '—'}
                    </span>
                    {!entry.id.startsWith('day-') ? (
                      <div className={styles.dayShiftActionsInline}>
                        <button
                          type="button"
                          className={styles.dayShiftEditBtn}
                          onClick={() => void openEditShiftEntry(entry)}
                        >
                          {t('planner', 'editShift')}
                        </button>
                        <button
                          type="button"
                          className={styles.dayShiftDeleteBtn}
                          onClick={() => void handleDeleteReportShift(entry)}
                        >
                          {t('planner', 'deleteShift')}
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {loading && <p className={styles.loading}>{t('common', 'loading')}</p>}
      </section>

      {activeShift ? (
        <div className={styles.activeShiftSticky}>
          <div className={styles.activeShiftStickyInfo}>
            <span className={styles.activeShiftTitleDot} />
            <span className={styles.activeShiftStickyTimer}>
              {t('planner', 'shiftElapsed')}: <strong>{shiftElapsedText}</strong>
            </span>
          </div>
          <button
            type="button"
            className={styles.activeShiftStickyBtn}
            disabled={activeShiftLoading}
            onClick={handleEndShift}
          >
            {activeShiftLoading ? '...' : t('planner', 'endShift')}
          </button>
        </div>
      ) : null}

      {dayActionsOpen && overlayBox ? (
        <div
          className={`${styles.modalOverlay} ${overlayBox.keyboardOpen ? styles.modalOverlayKeyboard : ''}`}
          style={{ top: overlayBox.top, height: overlayBox.height }}
          onClick={() => setDayActionsOpen(false)}
        >
          <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <p className={styles.dayActionsTitle}>{selectedDayLabel}</p>
            <p className={styles.dayActionsMeta}>
              {dayHasShift
                ? `${formatHoursMinutes(current.workedHours, {
                    hours: t('planner', 'hoursShort'),
                    minutes: t('planner', 'minutesShort'),
                  })}${
                    selectedDayPay > 0
                      ? ` · ${formatPlannerMoney(selectedDayPay, locale, current.salaryCurrency)}`
                      : ''
                  }`
                : t('planner', 'dayShiftsEmpty')}
            </p>
            <div className={styles.dayActions}>
              <button
                type="button"
                className={styles.addShiftBtn}
                onClick={() => {
                  setDayActionsOpen(false);
                  setChooserOpen(true);
                }}
              >
                {dayHasShift ? t('planner', 'dayShifts') : t('planner', 'addShift')}
              </button>
              {/* Почати зміну можна лише коли жодна не йде — інакше кнопки немає,
                  як і раніше було під календарем. */}
              {!activeShift ? (
                <button
                  type="button"
                  className={styles.startShiftBtn}
                  disabled={activeShiftLoading}
                  onClick={() => {
                    setDayActionsOpen(false);
                    openStartShiftFlow();
                  }}
                >
                  {activeShiftLoading ? '...' : t('planner', 'startShift')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {startShiftChooserOpen && overlayBox ? (
        <div
          className={`${styles.modalOverlay} ${overlayBox.keyboardOpen ? styles.modalOverlayKeyboard : ''}`}
          style={{ top: overlayBox.top, height: overlayBox.height }}
          onClick={() => setStartShiftChooserOpen(false)}
        >
          <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.addShiftBtn}
              disabled={activeShiftLoading}
              onClick={() => void handleStartShift(null)}
            >
              {t('planner', 'startWithoutTemplate')}
            </button>
            {shiftTemplates.length > 0 ? (
              <>
                <p className={styles.templateSectionLabel}>{t('planner', 'chooseStartTemplate')}</p>
                <ul className={styles.templateList} role="list">
                  {shiftTemplates.map((tpl) => {
                    const label =
                      tpl.name.trim() && tpl.symbol.trim()
                        ? `${tpl.name.trim()} · ${tpl.symbol.trim()}`
                        : tpl.name.trim() || tpl.symbol.trim();
                    const curTag = tpl.salaryCurrency === 'PLN' ? 'zł' : '₴';
                    return (
                      <li key={`start-${tpl.id}`} className={styles.templateRow}>
                        <button
                          type="button"
                          className={styles.templateBtn}
                          disabled={activeShiftLoading}
                          onClick={() => void handleStartShift(tpl)}
                        >
                          {label}
                          <span className={styles.templateCurrencyTag}>{curTag}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Шторка дня: список змін цього дня, а не одна «зміна дня». Кожен рядок
          відкриває саме свою зміну — раніше кнопка «Редагувати» вела до форми
          дня, і на дні із записом бота збереження просто нічого не міняло. */}
      {chooserOpen && overlayBox ? (
        <div
          className={`${styles.modalOverlay} ${overlayBox.keyboardOpen ? styles.modalOverlayKeyboard : ''}`}
          style={{ top: overlayBox.top, height: overlayBox.height }}
          onClick={() => setChooserOpen(false)}
        >
          <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <p className={styles.dayActionsTitle}>{selectedDayLabel}</p>

            {dayShiftEntriesLoading ? (
              <p className={styles.dayShiftsEmpty}>{t('common', 'loading')}</p>
            ) : dayShiftEntries.length === 0 ? (
              <p className={styles.dayShiftsEmpty}>{t('planner', 'dayShiftsEmpty')}</p>
            ) : (
              <ul className={styles.dayShiftsList} role="list">
                {dayShiftEntries.map((entry) => (
                  <li key={entry.id} className={styles.dayShiftRow}>
                    <button
                      type="button"
                      className={styles.dayShiftPickBtn}
                      onClick={() => openEditShiftEntry(entry)}
                    >
                      <span className={styles.dayShiftMain}>{entry.note || t('planner', 'shiftTitle')}</span>
                      <span className={styles.dayShiftMeta}>{describeShiftEntry(entry)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              className={styles.addShiftBtn}
              onClick={() => openNewShift(selectedDay)}
            >
              {t('planner', 'addShift')}
            </button>

            {shiftTemplates.length > 0 ? (
              <>
                <p className={styles.templateSectionLabel}>{t('planner', 'templates')}</p>
                <ul className={styles.templateList} role="list">
                  {shiftTemplates.map((tpl) => {
                    const label =
                      tpl.name.trim() && tpl.symbol.trim()
                        ? `${tpl.name.trim()} · ${tpl.symbol.trim()}`
                        : tpl.name.trim() || tpl.symbol.trim();
                    const curTag = tpl.salaryCurrency === 'PLN' ? 'zł' : '₴';
                    return (
                      <li key={tpl.id} className={styles.templateRow}>
                        {/* Шаблон відкриває форму вже заповненою — разом зі
                            своїм часом, який досі мовчки замінювався на «зараз». */}
                        <button
                          type="button"
                          className={styles.templateBtn}
                          onClick={() => openNewShiftFromTemplate(selectedDay, tpl)}
                        >
                          {label}
                          <span className={styles.templateCurrencyTag}>{curTag}</span>
                        </button>
                        <button
                          type="button"
                          className={styles.templateDeleteBtn}
                          aria-label={t('planner', 'deleteTemplate')}
                          title={t('planner', 'deleteTemplate')}
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteShiftTemplate(tpl);
                          }}
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Ключ змушує форму зібратися наново на кожне відкриття.
          Без нього поля лишалися б з попереднього разу: їхній початковий стан
          береться один раз, при монтуванні, — і зміна, відкрита на правку,
          показувала б типові 09:00–17:00 замість власного часу. */}
      {shiftForm ? (
      <ShiftFormSheet
        key={shiftForm.id || `new-${shiftFormDay}`}
        value={shiftForm}
        dayLabel={parseIsoLocal(shiftFormDay).toLocaleDateString(locale, {
          weekday: 'short',
          day: 'numeric',
          month: 'long',
        })}
        templates={shiftTemplates}
        onClose={() => setShiftForm(null)}
        onSubmit={submitShiftForm}
        onDelete={
          shiftForm?.id
            ? async () => {
                const entry = dayShiftEntries.find((row) => row.id === shiftForm.id)
                  ?? reportShiftEntries.find((row) => row.id === shiftForm.id);
                if (entry) await deleteShiftEntry(entry);
              }
            : undefined
        }
      />
      ) : null}

      <div className={styles.spacer} />
    </div>
  );
};

export default CalendarPlanner;
