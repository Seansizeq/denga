import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import { formatCurrency } from '../utils/formatters';
import styles from './CalendarPlanner.module.css';

interface DayPlan {
  hasShift: boolean;
  workedHours: number;
  salaryRate: number;
  salaryAmount: number;
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
}

const API_URL = import.meta.env.VITE_API_URL ?? '';

const toIsoLocal = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const todayIso = (): string => toIsoLocal(new Date());
const monthLabel = (value: string, locale: string): string => {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
};

const shiftMonth = (monthValue: string, delta: number): string => {
  const [year, month] = monthValue.split('-').map(Number);
  const shifted = new Date(year, (month - 1) + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
};

const buildDaysForMonth = (monthValue: string): string[] => {
  const [year, month] = monthValue.split('-').map(Number);
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
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
  const [editorOpened, setEditorOpened] = useState(false);
  const [shiftName, setShiftName] = useState('');
  const [shiftSymbol, setShiftSymbol] = useState('');
  const [isFullDay, setIsFullDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [vvRev, setVvRev] = useState(0);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [salaryRateInput, setSalaryRateInput] = useState('');
  const [salaryAmountInput, setSalaryAmountInput] = useState('');

  const modalAnyOpen = chooserOpen || editorOpened;

  const overlayBox = useMemo(() => {
    if (!modalAnyOpen) return null;
    return readVisualOverlayBox();
  }, [modalAnyOpen, vvRev]);

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
    note: '',
  };

  const dayHasShift = Boolean(current.hasShift || current.note.trim());

  const monthReport = useMemo(() => {
    const days = buildDaysForMonth(month);
    let totalHours = 0;
    let totalSalary = 0;
    for (const day of days) {
      const p = store[day];
      if (!p?.hasShift) continue;
      totalHours += p.workedHours || 0;
      totalSalary += expectedPayForDay(p);
    }
    return { totalHours, totalSalary };
  }, [store, month]);

  useEffect(() => {
    let cancelled = false;
    const loadMonth = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/planner?month=${month}`);
        if (!response.ok) throw new Error(`Planner load failed: ${response.status}`);
        const rows = (await response.json()) as Array<DayPlan & { day: string }>;
        if (cancelled) return;
        const next: PlannerStore = {};
        for (const row of rows) {
          next[row.day] = {
            hasShift: Boolean(row.hasShift),
            workedHours: toNumber(row.workedHours),
            salaryRate: toNumber(row.salaryRate),
            salaryAmount: toNumber(row.salaryAmount),
            note: row.note ?? '',
          };
        }
        setStore(next);
      } catch (error) {
        console.error('Failed to load planner data:', error);
        if (!cancelled) setStore({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadMonth();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const loadShiftTemplates = async () => {
    try {
      const response = await fetch(`${API_URL}/api/planner/shift-templates`);
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
      const response = await fetch(`${API_URL}/api/planner/shift-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          symbol,
          isFullDay,
          startTime,
          endTime,
          workedHours,
        }),
      });
      if (response.ok) void loadShiftTemplates();
    } catch (error) {
      console.error('Failed to save shift template:', error);
    }
  };

  const saveDay = async (dayIso: string, payload: DayPlan): Promise<boolean> => {
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/planner/${dayIso}`, {
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
    setStore((prev) => ({ ...prev, [selectedDay]: payload }));
    setEditorOpened(true);
    setChooserOpen(false);
    setShiftName('');
    setShiftSymbol('');
    setIsFullDay(true);
    setStartTime('09:00');
    setEndTime('17:00');
    setSalaryRateInput('');
    setSalaryAmountInput('');
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
    };
    setStore((prev) => ({ ...prev, [selectedDay]: payload }));
    const ok = await saveDay(selectedDay, payload);
    if (ok) setChooserOpen(false);
  };

  const applyTemplateToDay = async (tpl: ShiftTemplate) => {
    const note = [tpl.name.trim(), tpl.symbol.trim()].filter(Boolean).join(' • ');
    const payload: DayPlan = {
      ...current,
      hasShift: true,
      workedHours: tpl.workedHours,
      note,
    };
    setStore((prev) => ({ ...prev, [selectedDay]: payload }));
    const ok = await saveDay(selectedDay, payload);
    if (ok) setChooserOpen(false);
  };

  const deleteShiftTemplate = async (tpl: ShiftTemplate) => {
    if (!window.confirm(t('planner', 'deleteTemplateConfirm'))) return;
    try {
      const response = await fetch(`${API_URL}/api/planner/shift-templates/${encodeURIComponent(tpl.id)}`, {
        method: 'DELETE',
      });
      if (response.ok) void loadShiftTemplates();
    } catch (error) {
      console.error('Failed to delete shift template:', error);
    }
  };

  const todayIsoStr = todayIso();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('planner', 'title')}</h1>
        <p className={styles.subtitle}>{t('planner', 'subtitle')}</p>
      </header>

      <section className={styles.panel}>
        <div className={styles.monthRow}>
          <div className={styles.monthBlock}>
            <span className={styles.monthLabel}>{monthLabel(month, locale)}</span>
          </div>
          <div className={styles.monthControls}>
            <button type="button" className={styles.arrowBtn} onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
            <button type="button" className={styles.arrowBtn} onClick={() => setMonth(shiftMonth(month, 1))}>→</button>
            <input type="month" className={styles.monthInput} value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>

        <div className={styles.reportCard}>
          <h3 className={styles.reportCardTitle}>{t('planner', 'monthReportTitle')}</h3>
          <div className={styles.reportRow}>
            <span className={styles.reportLabel}>{t('planner', 'reportHoursTotal')}</span>
            <strong className={styles.reportValue}>
              {monthReport.totalHours.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 0 })}
            </strong>
          </div>
          <div className={styles.reportRow}>
            <span className={styles.reportLabel}>{t('planner', 'expectedSalary')}</span>
            <strong className={styles.reportValue}>{formatCurrency(monthReport.totalSalary, locale)}</strong>
          </div>
        </div>

        <div className={styles.weekdays}>
          {weekdays.map((dayName) => <span key={dayName} className={styles.weekday}>{dayName}</span>)}
        </div>

        <div className={styles.grid}>
          {calendarCells.map((dayIso, idx) => {
            if (!dayIso) return <span key={`empty-${idx}`} className={styles.emptyDay} aria-hidden="true" />;
            const dayNum = Number(dayIso.slice(-2));
            const isToday = dayIso === todayIsoStr;
            const isSelected = dayIso === selectedDay;
            const hasData = Boolean(store[dayIso]?.hasShift || store[dayIso]?.salaryAmount || store[dayIso]?.note);
            return (
              <button
                key={dayIso}
                type="button"
                className={`${styles.day} ${isSelected ? styles.dayActive : ''} ${isToday ? styles.dayToday : ''}`}
                aria-current={isToday ? 'date' : undefined}
                onClick={() => {
                  setSelectedDay(dayIso);
                  setChooserOpen(true);
                }}
              >
                {dayNum}
                {hasData && <span className={styles.dot} />}
              </button>
            );
          })}
        </div>

        {loading && <p className={styles.loading}>{t('planner', 'loading')}</p>}
      </section>

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
                    return (
                      <li key={tpl.id} className={styles.templateRow}>
                        <button
                          type="button"
                          className={styles.templateBtn}
                          disabled={saving}
                          onClick={() => void applyTemplateToDay(tpl)}
                        >
                          {label}
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
                <span className={styles.closeGlyph} aria-hidden>
                  ✕
                </span>
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
                  note: [shiftName.trim(), shiftSymbol.trim()].filter(Boolean).join(' • '),
                };
                setStore((prev) => ({ ...prev, [selectedDay]: payload }));
                const ok = await saveDay(selectedDay, payload);
                if (ok) {
                  await persistShiftTemplate();
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
