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

interface ShiftTemplate {
  id: string;
  name: string;
  hasShift: boolean;
  workedHours: number;
  salaryRate: number;
  salaryAmount: number;
}

type PlannerStore = Record<string, DayPlan>;

const API_URL = import.meta.env.VITE_API_URL ?? '';
const PLANNER_PREFS_KEY = 'planner_preferences_v1';

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

  const templates = useMemo<ShiftTemplate[]>(() => {
    try {
      const raw = localStorage.getItem(PLANNER_PREFS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as any;
      if (!Array.isArray(parsed?.templates)) return [];
      return parsed.templates
        .filter((tpl: any) => tpl && typeof tpl.name === 'string')
        .map((tpl: any) => ({
          id: typeof tpl.id === 'string' ? tpl.id : crypto.randomUUID(),
          name: String(tpl.name),
          hasShift: Boolean(tpl.hasShift),
          workedHours: toNumber(tpl.workedHours),
          salaryRate: toNumber(tpl.salaryRate),
          salaryAmount: toNumber(tpl.salaryAmount),
        }));
    } catch {
      return [];
    }
  }, [chooserOpen]);

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

  const updateCurrent = (patch: Partial<DayPlan>) => {
    const merged = { ...current, ...patch };
    setStore((prev) => ({
      ...prev,
      [selectedDay]: {
        hasShift: Boolean(merged.hasShift),
        workedHours: toNumber(merged.workedHours),
        salaryRate: toNumber(merged.salaryRate),
        salaryAmount: toNumber(merged.salaryAmount),
        note: String(merged.note ?? ''),
      },
    }));
  };

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

  const applyShift = async (payload: DayPlan) => {
    setStore((prev) => ({ ...prev, [selectedDay]: payload }));
    setEditorOpened(true);
    setChooserOpen(false);
    await saveDay(selectedDay, payload);
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

        {editorOpened ? (
          <>
            <div className={styles.formRow}>
              <label>{t('planner', 'workedHours')}</label>
              <input type="number" min={0} step="0.5" value={current.workedHours || ''} onChange={(e) => updateCurrent({ workedHours: Number(e.target.value || 0) })} />
            </div>
            <div className={styles.formRow}>
              <label>{t('planner', 'salaryRate')}</label>
              <input type="number" min={0} value={current.salaryRate || ''} onChange={(e) => updateCurrent({ salaryRate: Number(e.target.value || 0) })} />
            </div>
            <div className={styles.formRow}>
              <label>{t('planner', 'salaryAmount')}</label>
              <input type="number" min={0} value={current.salaryAmount || ''} onChange={(e) => updateCurrent({ salaryAmount: Number(e.target.value || 0) })} />
            </div>
            <div className={styles.formRow}>
              <label>{t('planner', 'note')}</label>
              <textarea rows={3} value={current.note} placeholder={t('planner', 'notePlaceholder')} onChange={(e) => updateCurrent({ note: e.target.value })} />
            </div>
            <button type="button" className={styles.saveBtn} disabled={saving} onClick={() => saveDay(selectedDay, current)}>
              {justSaved ? t('planner', 'saved') : saving ? '...' : t('planner', 'save')}
            </button>
          </>
        ) : null}

        {loading && <p className={styles.loading}>{t('planner', 'loading')}</p>}
      </section>

      {chooserOpen ? (
        <div className={styles.modalOverlay} onClick={() => setChooserOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
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
            {templates.length > 0 ? (
              <div className={styles.templateChooser}>
                <p className={styles.templateChooserTitle}>{t('planner', 'templates')}</p>
                <div className={styles.templateList}>
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      className={styles.reportBtn}
                      onClick={() =>
                        applyShift({
                          hasShift: tpl.hasShift,
                          workedHours: tpl.workedHours,
                          salaryRate: tpl.salaryRate,
                          salaryAmount: tpl.salaryAmount,
                          note: '',
                        })
                      }
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={styles.spacer} />
    </div>
  );
};

export default CalendarPlanner;
