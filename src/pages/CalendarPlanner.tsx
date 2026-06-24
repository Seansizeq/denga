import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { formatPlannerMoney, type PlannerCurrency } from '../utils/formatters';
import type { RangeFilter } from '../components/ui/RecentTransactions';
import {
  apiFetch,
  getPlannerSettings,
} from '../api/client';
import { hapticLight } from '../utils/notify';
import { buildPastDays, isWithinLastDays } from '../utils/dateRanges';
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

const addHoursToTime = (start: string, hours: number): string => {
  const [h, m] = start.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '17:00';
  const startMin = h * 60 + m;
  const endMin = startMin + Math.round(hours * 60);
  const total = ((endMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
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

const parseMoneyInput = (raw: string): number => {
  const n = parseFloat(String(raw).replace(',', '.').trim());
  return Number.isFinite(n) ? Math.max(0, n) : 0;
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

const normalizeTemplateKey = (name: string, symbol: string, currency: PlannerCurrency): string =>
  `${name.trim().toLowerCase()}::${symbol.trim().toLowerCase()}::${currency === 'PLN' ? 'PLN' : 'UAH'}`;

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

const formatDecimalHoursAsHoursMinutes = (
  decimalHours: number,
  unitLabels: { hours: string; minutes: string }
): string => {
  const total = Math.max(0, Number(decimalHours) || 0);
  let totalMinutes = Math.round(total * 60);
  let hours = Math.floor(totalMinutes / 60);
  let minutes = totalMinutes - hours * 60;
  if (minutes === 60) {
    hours += 1;
    minutes = 0;
  }
  if (hours === 0 && minutes === 0) return `0${unitLabels.hours}`;
  if (hours === 0) return `${minutes}${unitLabels.minutes}`;
  if (minutes === 0) return `${hours}${unitLabels.hours}`;
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
  const [justSaved, setJustSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [startShiftChooserOpen, setStartShiftChooserOpen] = useState(false);
  const [editorOpened, setEditorOpened] = useState(false);
  const [shiftName, setShiftName] = useState('');
  const [shiftSymbol, setShiftSymbol] = useState('');
  const [isFullDay, setIsFullDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [, setVvRev] = useState(0);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [defaultShiftTemplateId, setDefaultShiftTemplateId] = useState<string | null>(null);
  const [salaryRateInput, setSalaryRateInput] = useState('');
  const [salaryAmountInput, setSalaryAmountInput] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState<PlannerCurrency>('UAH');
  const [reportRange, setReportRange] = useState<PlannerReportRange>('month');
  const [customFrom, setCustomFrom] = useState(() => `${todayIso().slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(() => todayIso());
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [activeShiftLoading, setActiveShiftLoading] = useState(false);
  const [dayShiftEntries, setDayShiftEntries] = useState<ShiftEntry[]>([]);
  const [dayShiftEntriesLoading, setDayShiftEntriesLoading] = useState(false);
  const [reportShiftEntries, setReportShiftEntries] = useState<ShiftEntry[]>([]);
  const [reportShiftEntriesLoading, setReportShiftEntriesLoading] = useState(false);
  const monthInputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [shiftElapsedText, setShiftElapsedText] = useState('0г 0хв');

  const modalAnyOpen = chooserOpen || editorOpened || startShiftChooserOpen;

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
    if (!window.confirm(t('planner', 'endShiftConfirm') || 'Завершити зміну?')) return;
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

  const reportShiftBanners = useMemo(() => {
    const days = reportDaysKey ? reportDaysKey.split('|') : [];
    const existingDays = new Set(reportShiftEntries.map((entry) => entry.day));
    const merged = [...reportShiftEntries];
    for (const day of days) {
      if (existingDays.has(day)) continue;
      const plan = store[day];
      if (!plan?.hasShift) continue;
      const fallbackPay = plan.salaryAmountUah || plan.salaryAmountPln
        ? (plan.salaryAmountPln && plan.salaryAmountPln > 0 ? plan.salaryAmountPln : plan.salaryAmountUah || 0)
        : expectedPayForDay(plan);
      const fallbackCurrency: PlannerCurrency =
        plan.salaryAmountPln && plan.salaryAmountPln > 0
          ? 'PLN'
          : plan.salaryCurrency === 'PLN'
            ? 'PLN'
            : 'UAH';
      merged.push({
        id: `day-${day}`,
        day,
        startedAt: `${day}T00:00:00.000Z`,
        endedAt: `${day}T00:00:00.000Z`,
        workedHours: toNumber(plan.workedHours),
        salaryRate: toNumber(plan.salaryRate),
        salaryAmount: toNumber(fallbackPay),
        salaryCurrency: fallbackCurrency,
        note: plan.note ?? '',
      });
    }
    return merged.sort((a, b) => String(b.endedAt || '').localeCompare(String(a.endedAt || '')));
  }, [reportShiftEntries, reportDaysKey, store]);

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

  const selectDay = (dayIso: string) => {
    setSelectedDay(dayIso);
    setReportRange('day');
  };

  const openDaySheet = (dayIso: string) => {
    setSelectedDay(dayIso);
    setReportRange('day');
    setChooserOpen(true);
  };

  const handleDayTouchStart = (dayIso: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      hapticLight();
      openDaySheet(dayIso);
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

  const hoursFromTimeRange = (start: string, end: string): number => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) return 0;
    const startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin <= startMin) endMin += 24 * 60;
    return Math.max(0, Number(((endMin - startMin) / 60).toFixed(2)));
  };

  const persistShiftTemplate = async () => {
    const name = shiftName.trim();
    const symbol = shiftSymbol.trim();
    if (!name && !symbol) return;
    try {
      const workedHours = isFullDay ? 8 : hoursFromTimeRange(startTime, endTime);
      const response = await apiFetch('/api/planner/shift-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          symbol,
          isFullDay,
          startTime,
          endTime,
          workedHours,
          salaryRate: parseMoneyInput(salaryRateInput),
          salaryAmount: parseMoneyInput(salaryAmountInput),
          salaryCurrency,
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

  const saveDay = async (dayIso: string, payload: DayPlan): Promise<boolean> => {
    setSaving(true);
    try {
      const response = await apiFetch(`/api/planner/${dayIso}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Planner save failed: ${response.status}`);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1200);
      return true;
    } catch (error) {
      console.error('Failed to save planner day:', error);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const applyShift = (payload: DayPlan) => {
    prefillEditorFromPlan(payload);
    setEditorOpened(true);
    setChooserOpen(false);
  };

  const prefillEditorFromPlan = (plan: DayPlan) => {
    const { name, symbol } = parseNoteToNameSymbol(plan.note);
    setShiftName(name);
    setShiftSymbol(symbol);
    const wh = plan.workedHours;
    if (Math.abs(wh - 8) < 0.05) {
      setIsFullDay(true);
      setStartTime('09:00');
      setEndTime('17:00');
    } else if (wh > 0) {
      setIsFullDay(false);
      setStartTime('09:00');
      setEndTime(addHoursToTime('09:00', wh));
    } else {
      setIsFullDay(true);
      setStartTime('09:00');
      setEndTime('17:00');
    }
    setSalaryRateInput(plan.salaryRate > 0 ? String(plan.salaryRate) : '');
    setSalaryAmountInput(plan.salaryAmount > 0 ? String(plan.salaryAmount) : '');
    setSalaryCurrency(plan.salaryCurrency === 'PLN' ? 'PLN' : 'UAH');
  };

  const openEditShift = () => {
    prefillEditorFromPlan(current);
    setEditorOpened(true);
    setChooserOpen(false);
  };

  const removeShiftFromDay = async () => {
    if (!window.confirm(t('planner', 'deleteShiftConfirm'))) return;
    const payload: DayPlan = {
      ...current,
      hasShift: false,
      workedHours: 0,
      note: '',
      salaryRate: 0,
      salaryAmount: 0,
      salaryCurrency: 'UAH',
    };
    const ok = await saveDay(selectedDay, payload);
    if (ok) {
      setStore((prev) => ({ ...prev, [selectedDay]: payload }));
      setChooserOpen(false);
    }
  };

  const applyTemplateToDay = async (tpl: ShiftTemplate) => {
    setSaving(true);
    try {
      const response = await apiFetch(`/api/planner/${encodeURIComponent(selectedDay)}/shifts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: tpl.id }),
      });
      if (!response.ok) throw new Error(`Apply template failed: ${response.status}`);
      await reloadPlannerData();
      await loadDayShiftEntries(selectedDay);
      await loadReportShiftEntries(reportDays);
      setChooserOpen(false);
    } catch (error) {
      console.error('Failed to apply template as shift entry:', error);
    } finally {
      setSaving(false);
    }
  };

  const deleteShiftTemplate = async (tpl: ShiftTemplate) => {
    if (!window.confirm(t('planner', 'deleteTemplateConfirm'))) return;
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

  const refreshAfterShiftEntryMutation = async (dayIso: string) => {
    const days = reportDaysKey ? reportDaysKey.split('|') : [];
    await reloadPlannerData();
    await loadReportShiftEntries(days);
    if (chooserOpen && dayIso === selectedDay) {
      await loadDayShiftEntries(dayIso);
    }
  };

  const handleEditReportShift = async (entry: ShiftEntry) => {
    if (entry.id.startsWith('day-')) return;
    const nextHoursRaw = window.prompt(t('planner', 'editShiftHoursPrompt'), String(entry.workedHours));
    if (nextHoursRaw === null) return;
    const nextHours = parseMoneyInput(nextHoursRaw);
    const nextAmountRaw = window.prompt(t('planner', 'editShiftAmountPrompt'), String(entry.salaryAmount));
    if (nextAmountRaw === null) return;
    const nextAmount = parseMoneyInput(nextAmountRaw);
    const nextNoteRaw = window.prompt(t('planner', 'editShiftNotePrompt'), entry.note || '');
    if (nextNoteRaw === null) return;
    try {
      const response = await apiFetch(`/api/planner/shifts/${encodeURIComponent(entry.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workedHours: nextHours,
          salaryAmount: nextAmount,
          salaryCurrency: entry.salaryCurrency,
          note: nextNoteRaw.trim(),
        }),
      });
      if (!response.ok) throw new Error(`Edit shift failed: ${response.status}`);
      await refreshAfterShiftEntryMutation(entry.day);
    } catch (error) {
      console.error('Failed to edit report shift:', error);
    }
  };

  const handleDeleteReportShift = async (entry: ShiftEntry) => {
    if (entry.id.startsWith('day-')) return;
    if (!window.confirm(t('planner', 'deleteShiftEntryConfirm'))) return;
    try {
      const response = await apiFetch(`/api/planner/shifts/${encodeURIComponent(entry.id)}`, {
        method: 'DELETE',
      });
      if (!response.ok && response.status !== 204) throw new Error(`Delete shift failed: ${response.status}`);
      await refreshAfterShiftEntryMutation(entry.day);
    } catch (error) {
      console.error('Failed to delete report shift:', error);
    }
  };

  const todayIsoStr = todayIso();
  const currentMonthLabel = monthLabel(month, locale);
  const selectedDayLabel = parseIsoLocal(selectedDay).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
  const selectedDayPay = expectedPayForDay(current);

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
              onClick={() => {
                const picker = monthInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
                if (!picker) return;
                if (typeof picker.showPicker === 'function') {
                  picker.showPicker();
                  return;
                }
                picker.focus();
                picker.click();
              }}
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
              >
                <span className={styles.dayNum}>{dayNum}</span>
                {daySymbol ? <span className={styles.daySymbol}>{daySymbol}</span> : null}
                {hasData && <span className={styles.dot} />}
              </button>
            );
          })}
        </div>

        <div className={styles.dayCard}>
          <div className={styles.dayCardHeader}>
            <span className={styles.dayCardDate}>{selectedDayLabel}</span>
            {dayHasShift ? (
              <span className={styles.dayCardSummary}>
                {formatDecimalHoursAsHoursMinutes(current.workedHours, {
                  hours: t('planner', 'hoursShort'),
                  minutes: t('planner', 'minutesShort'),
                })}
                {selectedDayPay > 0
                  ? ` · ${formatPlannerMoney(selectedDayPay, locale, current.salaryCurrency)}`
                  : ''}
              </span>
            ) : (
              <span className={styles.dayCardEmpty}>{t('planner', 'dayShiftsEmpty')}</span>
            )}
          </div>
          <button
            type="button"
            className={styles.dayCardBtn}
            onClick={() => setChooserOpen(true)}
          >
            {dayHasShift ? t('planner', 'editShift') : t('planner', 'addShift')}
          </button>
        </div>

        {!activeShift ? (
          <button
            type="button"
            className={styles.startShiftBtn}
            disabled={activeShiftLoading}
            onClick={openStartShiftFlow}
          >
            {activeShiftLoading ? '...' : t('planner', 'startShift')}
          </button>
        ) : null}

        <div className={styles.reportCard}>
          <div className={styles.reportHeader}>
            <h3 className={styles.reportCardTitle}>
              {reportRange === 'day'
                ? t('planner', 'dayReportTitle')
                : reportRange === 'year'
                  ? t('planner', 'yearReportTitle')
                  : reportRange === 'custom'
                    ? t('planner', 'customReportTitle')
                    : t('planner', 'monthReportTitle')}
            </h3>
            <div className={styles.reportRangeTabs} role="tablist" aria-label={t('planner', 'report')}>
              {(['day', 'week', 'month', 'year', 'custom'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  role="tab"
                  aria-selected={reportRange === opt}
                  className={`${styles.reportRangeTabBtn} ${reportRange === opt ? styles.reportRangeTabBtnActive : ''}`}
                  onClick={() => {
                    setReportRange(opt);
                  }}
                >
                  {t('range', opt)}
                </button>
              ))}
            </div>
          </div>
          {reportRange === 'custom' ? (
            <div className={styles.customRangeRow}>
              <label className={styles.customRangeField}>
                <span className={styles.customRangeLabel}>{t('planner', 'customRangeFrom')}</span>
                <input
                  type="date"
                  className={styles.customRangeInput}
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next) return;
                    setCustomFrom(next);
                    if (customTo && next > customTo) setCustomTo(next);
                  }}
                />
              </label>
              <label className={styles.customRangeField}>
                <span className={styles.customRangeLabel}>{t('planner', 'customRangeTo')}</span>
                <input
                  type="date"
                  className={styles.customRangeInput}
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next) return;
                    setCustomTo(next);
                    if (customFrom && next < customFrom) setCustomFrom(next);
                  }}
                />
              </label>
            </div>
          ) : null}
          <div className={styles.reportStatsGrid}>
            <div className={styles.reportStatItem}>
              <span className={styles.reportLabel}>{t('planner', 'filledDays')}</span>
              <strong className={styles.reportValue}>{monthReport.filledDays}</strong>
            </div>
            <div className={styles.reportStatItem}>
              <span className={styles.reportLabel}>{t('planner', 'totalShifts')}</span>
              <strong className={styles.reportValue}>{monthReport.totalShifts}</strong>
            </div>
            <div className={styles.reportStatItem}>
              <span className={styles.reportLabel}>{t('planner', 'reportHoursTotal')}</span>
              <strong className={styles.reportValue}>
                {formatDecimalHoursAsHoursMinutes(monthReport.totalHours, {
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
              <p className={styles.dayShiftsEmpty}>{t('planner', 'loading')}</p>
            ) : reportShiftBanners.length === 0 ? (
              <p className={styles.dayShiftsEmpty}>{t('planner', 'reportShiftBannersEmpty')}</p>
            ) : (
              <ul className={styles.dayShiftsList} role="list">
                {reportShiftBanners.map((entry) => (
                  <li key={`report-${entry.id}`} className={styles.dayShiftRow}>
                    <span className={styles.dayShiftMain}>{entry.note || t('planner', 'shiftTitle')}</span>
                    <span className={styles.dayShiftMeta}>
                      {entry.day} ·{' '}
                      {formatDecimalHoursAsHoursMinutes(entry.workedHours, {
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
                          onClick={() => void handleEditReportShift(entry)}
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

        {loading && <p className={styles.loading}>{t('planner', 'loading')}</p>}
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
            <p className={styles.templateSectionLabel}>{t('planner', 'dayShifts')}</p>
            {dayShiftEntriesLoading ? (
              <p className={styles.dayShiftsEmpty}>{t('planner', 'loading')}</p>
            ) : dayShiftEntries.length === 0 ? (
              <p className={styles.dayShiftsEmpty}>{t('planner', 'dayShiftsEmpty')}</p>
            ) : (
              <ul className={styles.dayShiftsList} role="list">
                {dayShiftEntries.map((entry) => (
                  <li key={entry.id} className={styles.dayShiftRow}>
                    <span className={styles.dayShiftMain}>{entry.note || t('planner', 'shiftTitle')}</span>
                    <span className={styles.dayShiftMeta}>
                      {formatDecimalHoursAsHoursMinutes(entry.workedHours, {
                        hours: t('planner', 'hoursShort'),
                        minutes: t('planner', 'minutesShort'),
                      })}{' '}
                      ·{' '}
                      {entry.salaryAmount > 0 ? formatPlannerMoney(entry.salaryAmount, locale, entry.salaryCurrency) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {chooserOpen && overlayBox ? (
        <div
          className={`${styles.modalOverlay} ${overlayBox.keyboardOpen ? styles.modalOverlayKeyboard : ''}`}
          style={{ top: overlayBox.top, height: overlayBox.height }}
          onClick={() => setChooserOpen(false)}
        >
          <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            {dayHasShift ? (
              <div className={styles.dayShiftActions}>
                <button type="button" className={styles.editShiftBtn} onClick={openEditShift}>
                  {t('planner', 'editShift')}
                </button>
                <button
                  type="button"
                  className={styles.deleteShiftBtn}
                  disabled={saving}
                  onClick={() => void removeShiftFromDay()}
                >
                  {t('planner', 'deleteShift')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.addShiftBtn}
                onClick={() =>
                  applyShift({
                    hasShift: true,
                    workedHours: 8,
                    salaryRate: 0,
                    salaryAmount: 0,
                    salaryCurrency: 'UAH',
                    note: '',
                  })
                }
              >
                {t('planner', 'addShift')}
              </button>
            )}
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
                        <button
                          type="button"
                          className={styles.templateBtn}
                          disabled={saving}
                          onClick={() => void applyTemplateToDay(tpl)}
                        >
                          {label}
                          <span className={styles.templateCurrencyTag}>{curTag}</span>
                        </button>
                        <button
                          type="button"
                          className={styles.templateDeleteBtn}
                          disabled={saving}
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

      {editorOpened && overlayBox ? (
        <div
          className={`${styles.modalOverlay} ${overlayBox.keyboardOpen ? styles.modalOverlayKeyboard : ''}`}
          style={{ top: overlayBox.top, height: overlayBox.height }}
          onClick={() => setEditorOpened(false)}
        >
          <section className={styles.modalSheetEditor} onClick={(e) => e.stopPropagation()}>
            <div className={styles.editorTop}>
                <button
                  type="button"
                  className={styles.closeTextBtn}
                  onClick={() => setEditorOpened(false)}
                >
                  <span>{t('planner', 'dismiss')}</span>
                </button>
              <h2 className={styles.modalTitle}>{t('planner', 'shiftTitle')}</h2>
            </div>

            <div className={styles.modalScrollBody}>
              <div className={styles.formBlock}>
                <div className={styles.formRow}>
                  <label htmlFor="shift-name">{t('subscriptions', 'name')}</label>
                  <input
                    id="shift-name"
                    type="text"
                    enterKeyHint="next"
                    autoComplete="off"
                    value={shiftName}
                    onChange={(e) => setShiftName(e.target.value)}
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="shift-symbol">{t('planner', 'shiftSymbolLabel')}</label>
                  <input
                    id="shift-symbol"
                    type="text"
                    enterKeyHint="done"
                    autoComplete="off"
                    value={shiftSymbol}
                    onChange={(e) => setShiftSymbol(e.target.value)}
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <h3 className={styles.groupTitle}>{t('planner', 'defaultValues')}</h3>
              <div className={styles.formBlock}>
                <div className={styles.rowBetween}>
                  <span className={styles.rowLabel}>{t('planner', 'fullDay')}</span>
                  <label className={styles.switch}>
                    <input type="checkbox" checked={isFullDay} onChange={(e) => setIsFullDay(e.target.checked)} />
                    <span className={styles.slider} />
                  </label>
                </div>
                <div className={styles.rowBetween}>
                  <span className={styles.rowLabel}>{t('planner', 'timeStart')}</span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={styles.timeInput}
                    disabled={isFullDay}
                  />
                </div>
                <div className={styles.rowBetween}>
                  <span className={styles.rowLabel}>{t('planner', 'timeEnd')}</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={styles.timeInput}
                    disabled={isFullDay}
                  />
                </div>
              </div>

              <h3 className={styles.groupTitle}>{t('planner', 'shiftPayment')}</h3>
              <p className={styles.salaryHint}>{t('planner', 'salaryForReportHint')}</p>
              <div className={styles.formBlock}>
                <div className={styles.rowBetween}>
                  <span className={styles.rowLabel}>{t('planner', 'currency')}</span>
                  <div className={styles.currencySegment} role="group" aria-label={t('planner', 'currency')}>
                    <button
                      type="button"
                      className={styles.currencySegmentBtn}
                      aria-pressed={salaryCurrency === 'UAH'}
                      onClick={() => setSalaryCurrency('UAH')}
                    >
                      ₴
                    </button>
                    <button
                      type="button"
                      className={styles.currencySegmentBtn}
                      aria-pressed={salaryCurrency === 'PLN'}
                      onClick={() => setSalaryCurrency('PLN')}
                    >
                      zł
                    </button>
                  </div>
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="shift-rate">{t('planner', 'salaryRate')}</label>
                  <input
                    id="shift-rate"
                    type="text"
                    inputMode="decimal"
                    enterKeyHint="next"
                    autoComplete="off"
                    placeholder="0"
                    value={salaryRateInput}
                    onChange={(e) => setSalaryRateInput(e.target.value)}
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="shift-amount">{t('planner', 'salaryAmount')}</label>
                  <input
                    id="shift-amount"
                    type="text"
                    inputMode="decimal"
                    enterKeyHint="done"
                    autoComplete="off"
                    placeholder="0"
                    value={salaryAmountInput}
                    onChange={(e) => setSalaryAmountInput(e.target.value)}
                    className={styles.fieldInput}
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              className={styles.saveBtn}
              disabled={saving}
              onClick={async () => {
                const workedHours = isFullDay ? 8 : hoursFromTimeRange(startTime, endTime);
                const salaryRate = parseMoneyInput(salaryRateInput);
                const salaryAmount = parseMoneyInput(salaryAmountInput);
                const payload: DayPlan = {
                  ...current,
                  hasShift: true,
                  workedHours,
                  salaryRate,
                  salaryAmount,
                  salaryCurrency,
                  note: [shiftName.trim(), shiftSymbol.trim()].filter(Boolean).join(' • '),
                };
                const ok = await saveDay(selectedDay, payload);
                if (ok) {
                  setStore((prev) => ({ ...prev, [selectedDay]: payload }));
                  const nextTemplateKey = normalizeTemplateKey(shiftName, shiftSymbol, salaryCurrency);
                  const templateAlreadyExists = shiftTemplates.some(
                    (tpl) => normalizeTemplateKey(tpl.name, tpl.symbol, tpl.salaryCurrency) === nextTemplateKey
                  );
                  if (!templateAlreadyExists && (shiftName.trim() || shiftSymbol.trim())) {
                    await persistShiftTemplate();
                  }
                  setEditorOpened(false);
                }
              }}
            >
              {justSaved ? t('planner', 'saved') : saving ? '...' : t('planner', 'save')}
            </button>
          </section>
        </div>
      ) : null}

      <div className={styles.spacer} />
    </div>
  );
};

export default CalendarPlanner;
