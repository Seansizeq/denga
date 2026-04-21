import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import styles from './CalendarPlanner.module.css';

interface DayPlan {
  hasShift: boolean;
  workedHours: number;
  salaryRate: number;
  salaryAmount: number;
  note: string;
}

type PlannerStore = Record<string, DayPlan>;

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

  useEffect(() => {
    if (!editorOpened && !chooserOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [editorOpened, chooserOpen]);

  const saveDay = async (dayIso: string, payload: DayPlan) => {
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
    } catch (error) {
      console.error('Failed to save planner day:', error);
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
  };

  const hoursFromTimeRange = (start: string, end: string): number => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) return 0;
    const startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin <= startMin) endMin += 24 * 60;
    return Math.max(0, Number(((endMin - startMin) / 60).toFixed(2)));
  };

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

        <div className={styles.weekdays}>
          {weekdays.map((dayName) => <span key={dayName} className={styles.weekday}>{dayName}</span>)}
        </div>

        <div className={styles.grid}>
          {calendarCells.map((dayIso, idx) => {
            if (!dayIso) return <span key={`empty-${idx}`} className={styles.emptyDay} aria-hidden="true" />;
            const dayNum = Number(dayIso.slice(-2));
            const active = dayIso === selectedDay;
            const hasData = Boolean(store[dayIso]?.hasShift || store[dayIso]?.salaryAmount || store[dayIso]?.note);
            return (
              <button
                key={dayIso}
                type="button"
                className={`${styles.day} ${active ? styles.dayActive : ''}`}
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

      {chooserOpen ? (
        <div className={styles.modalOverlay} onClick={() => setChooserOpen(false)}>
          <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
      ) : null}

      {editorOpened ? (
        <div className={styles.modalOverlay} onClick={() => setEditorOpened(false)}>
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
            </div>

            <button
              type="button"
              className={styles.saveBtn}
              disabled={saving}
              onClick={async () => {
                const workedHours = isFullDay ? 8 : hoursFromTimeRange(startTime, endTime);
                const payload: DayPlan = {
                  ...current,
                  hasShift: true,
                  workedHours,
                  note: [shiftName.trim(), shiftSymbol.trim()].filter(Boolean).join(' • '),
                };
                setStore((prev) => ({ ...prev, [selectedDay]: payload }));
                await saveDay(selectedDay, payload);
                setEditorOpened(false);
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
