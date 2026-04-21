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
type PlannerCurrency = 'UAH' | 'PLN';

interface PlannerPreferences {
  currency: PlannerCurrency;
  defaultWorkedHours: number;
  defaultSalaryRate: number;
  defaultSalaryAmount: number;
  autoCalcSalary: boolean;
  workingWeekdays: number[];
  templates: ShiftTemplate[];
  selectedTemplateId: string;
}

interface ShiftTemplate {
  id: string;
  name: string;
  hasShift: boolean;
  workedHours: number;
  salaryRate: number;
  salaryAmount: number;
}

const API_URL = import.meta.env.VITE_API_URL ?? '';
const PLANNER_PREFS_KEY = 'planner_preferences_v1';
const DEFAULT_PREFS: PlannerPreferences = {
  currency: 'UAH',
  defaultWorkedHours: 8,
  defaultSalaryRate: 0,
  defaultSalaryAmount: 0,
  autoCalcSalary: true,
  workingWeekdays: [1, 2, 3, 4, 5],
  templates: [
    { id: 'day', name: 'Денна', hasShift: true, workedHours: 8, salaryRate: 0, salaryAmount: 0 },
    { id: 'night', name: 'Нічна', hasShift: true, workedHours: 10, salaryRate: 0, salaryAmount: 0 },
    { id: 'off', name: 'Вихідний', hasShift: false, workedHours: 0, salaryRate: 0, salaryAmount: 0 },
  ],
  selectedTemplateId: 'day',
};

const toIsoLocal = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const todayIso = (): string => toIsoLocal(new Date());

const parseIsoLocal = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const monthLabel = (value: string, locale: string): string => {
  const [year, month] = value.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
};

const shiftMonth = (monthValue: string, delta: number): string => {
  const [year, month] = monthValue.split('-').map(Number);
  const shifted = new Date(year, (month - 1) + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
};

const buildDaysForMonth = (monthValue: string): string[] => {
  const [year, month] = monthValue.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    return `${year}-${String(month).padStart(2, '0')}-${day}`;
  });
};

const buildCalendarCells = (monthValue: string): Array<string | null> => {
  const days = buildDaysForMonth(monthValue);
  const [year, month] = monthValue.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const mondayStartOffset = (firstDay.getDay() + 6) % 7;
  return [...Array.from({ length: mondayStartOffset }, () => null), ...days];
};

const currencySymbol = (currency: PlannerCurrency): string => (currency === 'PLN' ? 'zł' : '₴');
const toNumber = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
};

const withAutoSalary = (
  data: Pick<DayPlan, 'workedHours' | 'salaryRate' | 'salaryAmount'>,
  autoCalc: boolean
): number => (autoCalc ? Number((toNumber(data.workedHours) * toNumber(data.salaryRate)).toFixed(2)) : toNumber(data.salaryAmount));

const CalendarPlanner: React.FC = () => {
  const { t, locale } = useTranslation();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(todayIso());
  const [store, setStore] = useState<PlannerStore>({});
  const [loadedStore, setLoadedStore] = useState<PlannerStore>({});
  const [justSaved, setJustSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [editorOpened, setEditorOpened] = useState(false);
  const [activeTab, setActiveTab] = useState<'calendar' | 'settings'>('calendar');
  const [prefs, setPrefs] = useState<PlannerPreferences>(DEFAULT_PREFS);
  const [importStatus, setImportStatus] = useState('');
  const today = todayIso();

  const days = useMemo(() => buildDaysForMonth(month), [month]);
  const calendarCells = useMemo(() => buildCalendarCells(month), [month]);
  const weekdays = useMemo(() => {
    const baseMonday = new Date(2024, 0, 1); // Monday
    return Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
        new Date(baseMonday.getFullYear(), baseMonday.getMonth(), baseMonday.getDate() + i)
      )
    );
  }, [locale]);
  const isDirty = useMemo(
    () => JSON.stringify(store) !== JSON.stringify(loadedStore),
    [store, loadedStore]
  );

  const report = useMemo(() => {
    return days.reduce(
      (acc, dayIso) => {
        const day = store[dayIso];
        if (!day?.hasShift) return acc;

        return {
          hours: acc.hours + (Number(day.workedHours) || 0),
          salary: acc.salary + (Number(day.salaryAmount) || 0),
        };
      },
      { hours: 0, salary: 0 }
    );
  }, [days, store]);
  const filledDays = useMemo(
    () => days.reduce((acc, dayIso) => (store[dayIso]?.hasShift ? acc + 1 : acc), 0),
    [days, store]
  );

  const current = store[selectedDay] ?? {
    hasShift: false,
    workedHours: 0,
    salaryRate: 0,
    salaryAmount: 0,
    note: '',
  };
  const hasShiftData = Boolean(
    current.hasShift || current.workedHours || current.salaryRate || current.salaryAmount || current.note
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLANNER_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PlannerPreferences>;
      const templates = (Array.isArray(parsed.templates) ? parsed.templates : DEFAULT_PREFS.templates)
        .map((tpl) => ({
          id: typeof tpl?.id === 'string' ? tpl.id : crypto.randomUUID(),
          name: typeof tpl?.name === 'string' && tpl.name.trim() ? tpl.name : 'Template',
          hasShift: Boolean(tpl?.hasShift),
          workedHours: toNumber(tpl?.workedHours),
          salaryRate: toNumber(tpl?.salaryRate),
          salaryAmount: toNumber(tpl?.salaryAmount),
        }))
        .slice(0, 8);
      const safeTemplates = templates.length ? templates : DEFAULT_PREFS.templates;
      const autoCalcSalary = parsed.autoCalcSalary !== undefined ? Boolean(parsed.autoCalcSalary) : DEFAULT_PREFS.autoCalcSalary;
      const defaultWorkedHours = toNumber(parsed.defaultWorkedHours);
      const defaultSalaryRate = toNumber(parsed.defaultSalaryRate);
      const defaultSalaryAmount = withAutoSalary(
        { workedHours: defaultWorkedHours, salaryRate: defaultSalaryRate, salaryAmount: toNumber(parsed.defaultSalaryAmount) },
        autoCalcSalary
      );
      setPrefs({
        currency: parsed.currency === 'PLN' ? 'PLN' : 'UAH',
        defaultWorkedHours,
        defaultSalaryRate,
        defaultSalaryAmount,
        autoCalcSalary,
        workingWeekdays: Array.isArray(parsed.workingWeekdays)
          ? parsed.workingWeekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6)
          : DEFAULT_PREFS.workingWeekdays,
        templates: safeTemplates,
        selectedTemplateId:
          typeof parsed.selectedTemplateId === 'string' && safeTemplates.some((tpl) => tpl.id === parsed.selectedTemplateId)
            ? parsed.selectedTemplateId
            : safeTemplates[0].id,
      });
    } catch (error) {
      console.error('Failed to parse planner prefs:', error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PLANNER_PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  useEffect(() => {
    let cancelled = false;
    const loadMonth = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/planner?month=${month}`);
        if (!response.ok) {
          throw new Error(`Planner load failed: ${response.status}`);
        }
        const rows = (await response.json()) as Array<{
          day: string;
          hasShift: boolean;
          workedHours: number;
          salaryRate: number;
          salaryAmount: number;
          note: string;
        }>;
        if (cancelled) return;
        const next: PlannerStore = {};
        for (const row of rows) {
          next[row.day] = {
            hasShift: Boolean(row.hasShift),
            workedHours: Number(row.workedHours) || 0,
            salaryRate: Number(row.salaryRate) || 0,
            salaryAmount: Number(row.salaryAmount) || 0,
            note: row.note ?? '',
          };
        }
        setStore(next);
        setLoadedStore(next);
      } catch (error) {
        console.error('Failed to load planner data:', error);
        if (!cancelled) {
          setStore({});
          setLoadedStore({});
        }
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
    const merged = {
      ...(store[selectedDay] ?? {
        hasShift: false,
        workedHours: 0,
        salaryRate: 0,
        salaryAmount: 0,
        note: '',
      }),
      ...patch,
    };
    const next: DayPlan = {
      hasShift: Boolean(merged.hasShift),
      workedHours: toNumber(merged.workedHours),
      salaryRate: toNumber(merged.salaryRate),
      salaryAmount: withAutoSalary(merged, prefs.autoCalcSalary),
      note: String(merged.note ?? ''),
    };
    setStore((prev) => ({
      ...prev,
      [selectedDay]: next,
    }));
  };

  const selectedTemplate = prefs.templates.find((tpl) => tpl.id === prefs.selectedTemplateId) ?? prefs.templates[0];
  const applyTemplateToSelectedDay = () => {
    if (!selectedTemplate) return;
    updateCurrent({
      hasShift: selectedTemplate.hasShift,
      workedHours: selectedTemplate.workedHours,
      salaryRate: selectedTemplate.salaryRate,
      salaryAmount: selectedTemplate.salaryAmount,
    });
    setEditorOpened(true);
  };

  const applyDefaultsToSelectedDay = () => {
    updateCurrent({
      hasShift: true,
      workedHours: prefs.defaultWorkedHours,
      salaryRate: prefs.defaultSalaryRate,
      salaryAmount: prefs.defaultSalaryAmount,
    });
    setEditorOpened(true);
  };

  const onSave = async () => {
    const payload = store[selectedDay] ?? current;
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/planner/${selectedDay}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Planner save failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to save planner day:', error);
      setSaving(false);
      return;
    }
    setSaving(false);
    setLoadedStore(store);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1300);
  };

  const canLeaveDraft = () => {
    if (!isDirty) return true;
    return window.confirm(t('planner', 'unsavedConfirm'));
  };

  const onMonthChange = (nextMonth: string) => {
    if (!canLeaveDraft()) return;
    setMonth(nextMonth);
    const [year, m] = nextMonth.split('-');
    setSelectedDay(`${year}-${m}-01`);
    setEditorOpened(false);
  };

  useEffect(() => {
    setEditorOpened(hasShiftData);
  }, [selectedDay, hasShiftData]);

  const toggleWeekday = (day: number) => {
    setPrefs((prev) => {
      const has = prev.workingWeekdays.includes(day);
      return {
        ...prev,
        workingWeekdays: has ? prev.workingWeekdays.filter((d) => d !== day) : [...prev.workingWeekdays, day].sort(),
      };
    });
  };

  const exportSettings = () => {
    const blob = new Blob([JSON.stringify(prefs, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `calendar-settings-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<PlannerPreferences>;
      const templates = (Array.isArray(parsed.templates) ? parsed.templates : DEFAULT_PREFS.templates).map((tpl) => ({
        id: typeof tpl?.id === 'string' ? tpl.id : crypto.randomUUID(),
        name: typeof tpl?.name === 'string' ? tpl.name : 'Template',
        hasShift: Boolean(tpl?.hasShift),
        workedHours: toNumber(tpl?.workedHours),
        salaryRate: toNumber(tpl?.salaryRate),
        salaryAmount: toNumber(tpl?.salaryAmount),
      }));
      setPrefs({
        currency: parsed.currency === 'PLN' ? 'PLN' : 'UAH',
        defaultWorkedHours: toNumber(parsed.defaultWorkedHours),
        defaultSalaryRate: toNumber(parsed.defaultSalaryRate),
        defaultSalaryAmount: withAutoSalary(
          {
            workedHours: toNumber(parsed.defaultWorkedHours),
            salaryRate: toNumber(parsed.defaultSalaryRate),
            salaryAmount: toNumber(parsed.defaultSalaryAmount),
          },
          parsed.autoCalcSalary !== undefined ? Boolean(parsed.autoCalcSalary) : DEFAULT_PREFS.autoCalcSalary
        ),
        autoCalcSalary: parsed.autoCalcSalary !== undefined ? Boolean(parsed.autoCalcSalary) : DEFAULT_PREFS.autoCalcSalary,
        workingWeekdays: Array.isArray(parsed.workingWeekdays)
          ? parsed.workingWeekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6)
          : DEFAULT_PREFS.workingWeekdays,
        templates: templates.length ? templates : DEFAULT_PREFS.templates,
        selectedTemplateId:
          typeof parsed.selectedTemplateId === 'string' ? parsed.selectedTemplateId : (templates[0]?.id ?? DEFAULT_PREFS.selectedTemplateId),
      });
      setImportStatus(t('planner', 'importSuccess'));
    } catch {
      setImportStatus(t('planner', 'importError'));
    }
    e.target.value = '';
  };

  const resetSettings = () => {
    setPrefs(DEFAULT_PREFS);
    setImportStatus('');
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>{t('planner', 'title')}</h1>
          <button
            type="button"
            className={styles.topSettingsBtn}
            onClick={() => setActiveTab((prev) => (prev === 'calendar' ? 'settings' : 'calendar'))}
            aria-label={t('planner', 'plannerSettings')}
          >
            ⚙
          </button>
        </div>
        <p className={styles.subtitle}>{t('planner', 'subtitle')}</p>
      </header>
      {activeTab === 'calendar' && <section className={styles.panel}>
        <div className={styles.monthRow}>
          <div className={styles.monthBlock}>
            <span className={styles.monthLabel}>{monthLabel(month, locale)}</span>
            <span className={styles.monthHint}>{t('planner', 'monthHint')}</span>
          </div>
          <div className={styles.monthControls}>
            <button
              type="button"
              className={styles.arrowBtn}
              onClick={() => onMonthChange(shiftMonth(month, -1))}
              aria-label={t('planner', 'prevMonth')}
            >
              ←
            </button>
            <button
              type="button"
              className={styles.reportBtn}
              onClick={() => setShowReport((prev) => !prev)}
            >
              {t('planner', 'report')}
            </button>
            <button
              type="button"
              className={styles.arrowBtn}
              onClick={() => onMonthChange(shiftMonth(month, 1))}
              aria-label={t('planner', 'nextMonth')}
            >
              →
            </button>
            <input
              type="month"
              className={styles.monthInput}
              value={month}
              onChange={(e) => onMonthChange(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.weekdays}>
          {weekdays.map((dayName) => (
            <span key={dayName} className={styles.weekday}>
              {dayName}
            </span>
          ))}
        </div>
        <div className={styles.grid}>
          {calendarCells.map((dayIso, idx) => {
            if (!dayIso) {
              return <span key={`empty-${idx}`} className={styles.emptyDay} aria-hidden="true" />;
            }
            const dayNum = Number(dayIso.slice(-2));
            const active = dayIso === selectedDay;
            const isToday = dayIso === today;
            const hasData = Boolean(store[dayIso]?.hasShift || store[dayIso]?.salaryAmount || store[dayIso]?.note);
            const weekday = parseIsoLocal(dayIso).getDay();
            const isWorkingDay = prefs.workingWeekdays.includes(weekday);
            return (
              <button
                key={dayIso}
                type="button"
                className={`${styles.day} ${active ? styles.dayActive : ''} ${isToday ? styles.dayToday : ''} ${isWorkingDay ? styles.dayWork : styles.dayOff}`}
                onClick={() => {
                  if (!canLeaveDraft()) return;
                  setSelectedDay(dayIso);
                  setEditorOpened(Boolean(store[dayIso]));
                }}
              >
                {dayNum}
                {hasData && <span className={styles.dot} />}
              </button>
            );
          })}
        </div>
        <div className={styles.quickStats}>
          <div className={styles.quickStatItem}>
            <span>{t('planner', 'filledDays')}</span>
            <strong>{filledDays}</strong>
          </div>
          <div className={styles.quickStatItem}>
            <span>{t('planner', 'workedHours')}</span>
            <strong>{report.hours.toFixed(1)}</strong>
          </div>
          <div className={styles.quickStatItem}>
            <span>{t('planner', 'expectedSalary')}</span>
            <strong>{currencySymbol(prefs.currency)}{report.salary.toFixed(2)}</strong>
          </div>
        </div>
        {loading && <p className={styles.loading}>{t('planner', 'loading')}</p>}
        {showReport && (
          <div className={styles.reportCard}>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.todayDot}`} />
                {t('planner', 'today')}
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.filledDot}`} />
                {t('planner', 'filledDay')}
              </span>
            </div>
            <div className={styles.reportRow}>
              <span>{t('planner', 'workedHours')}</span>
              <strong>{report.hours.toFixed(1)}</strong>
            </div>
            <div className={styles.reportRow}>
              <span>{t('planner', 'expectedSalary')}</span>
              <strong>{currencySymbol(prefs.currency)}{report.salary.toFixed(2)}</strong>
            </div>
          </div>
        )}
      </section>}

      {activeTab === 'settings' && <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{t('planner', 'plannerSettings')}</h2>
        <div className={styles.reportCard}>
          <h3 className={styles.sectionTitle}>{t('planner', 'generalSettings')}</h3>
          <div className={styles.formRow}>
            <label>{t('planner', 'currency')}</label>
            <select
              className={styles.selectInput}
              value={prefs.currency}
              onChange={(e) =>
                setPrefs((prev) => ({ ...prev, currency: e.target.value === 'PLN' ? 'PLN' : 'UAH' }))
              }
            >
              <option value="UAH">{t('planner', 'currencyUah')}</option>
              <option value="PLN">{t('planner', 'currencyPln')}</option>
            </select>
          </div>
          <label className={styles.switchRow}>
            <input
              type="checkbox"
              checked={prefs.autoCalcSalary}
              onChange={(e) =>
                setPrefs((prev) => ({
                  ...prev,
                  autoCalcSalary: e.target.checked,
                  defaultSalaryAmount: withAutoSalary(
                    {
                      workedHours: prev.defaultWorkedHours,
                      salaryRate: prev.defaultSalaryRate,
                      salaryAmount: prev.defaultSalaryAmount,
                    },
                    e.target.checked
                  ),
                }))
              }
            />
            <span>{t('planner', 'autoCalcSalary')}</span>
          </label>
        </div>
        <div className={styles.reportCard}>
          <h3 className={styles.sectionTitle}>{t('planner', 'defaultValues')}</h3>
          <div className={styles.formRow}>
            <label>{t('planner', 'defaultWorkedHours')}</label>
            <input
              type="number"
              min={0}
              step="0.5"
              value={prefs.defaultWorkedHours || ''}
              onChange={(e) =>
                setPrefs((prev) => {
                  const worked = toNumber(e.target.value);
                  return {
                    ...prev,
                    defaultWorkedHours: worked,
                    defaultSalaryAmount: withAutoSalary(
                      { workedHours: worked, salaryRate: prev.defaultSalaryRate, salaryAmount: prev.defaultSalaryAmount },
                      prev.autoCalcSalary
                    ),
                  };
                })
              }
            />
          </div>
          <div className={styles.formRow}>
            <label>{t('planner', 'defaultSalaryRate')}</label>
            <input
              type="number"
              min={0}
              value={prefs.defaultSalaryRate || ''}
              onChange={(e) =>
                setPrefs((prev) => {
                  const rate = toNumber(e.target.value);
                  return {
                    ...prev,
                    defaultSalaryRate: rate,
                    defaultSalaryAmount: withAutoSalary(
                      { workedHours: prev.defaultWorkedHours, salaryRate: rate, salaryAmount: prev.defaultSalaryAmount },
                      prev.autoCalcSalary
                    ),
                  };
                })
              }
            />
          </div>
          <div className={styles.formRow}>
            <label>{t('planner', 'defaultSalaryAmount')}</label>
            <input
              type="number"
              min={0}
              disabled={prefs.autoCalcSalary}
              value={prefs.defaultSalaryAmount || ''}
              onChange={(e) =>
                setPrefs((prev) => ({ ...prev, defaultSalaryAmount: toNumber(e.target.value) }))
              }
            />
          </div>
        </div>
        <div className={styles.reportCard}>
          <h3 className={styles.sectionTitle}>{t('planner', 'templates')}</h3>
          <div className={styles.templateList}>
            {prefs.templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className={`${styles.templateBtn} ${prefs.selectedTemplateId === tpl.id ? styles.templateBtnActive : ''}`}
                onClick={() => setPrefs((prev) => ({ ...prev, selectedTemplateId: tpl.id }))}
              >
                {tpl.name}
              </button>
            ))}
          </div>
          <div className={styles.templateList}>
            <button type="button" className={styles.reportBtn} onClick={applyTemplateToSelectedDay}>
              {t('planner', 'applyTemplate')}
            </button>
            <button type="button" className={styles.reportBtn} onClick={applyDefaultsToSelectedDay}>
              {t('planner', 'applyDefaults')}
            </button>
          </div>
        </div>
        <div className={styles.reportCard}>
          <h3 className={styles.sectionTitle}>{t('planner', 'workingDays')}</h3>
          <div className={styles.templateList}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                key={d}
                type="button"
                className={`${styles.templateBtn} ${prefs.workingWeekdays.includes(d) ? styles.templateBtnActive : ''}`}
                onClick={() => toggleWeekday(d)}
              >
                {weekdays[d === 0 ? 6 : d - 1]}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.reportCard}>
          <h3 className={styles.sectionTitle}>{t('planner', 'backupActions')}</h3>
          <div className={styles.templateList}>
            <button type="button" className={styles.reportBtn} onClick={exportSettings}>
              {t('planner', 'exportSettings')}
            </button>
            <label className={styles.reportBtn}>
              {t('planner', 'importSettings')}
              <input type="file" accept="application/json" className={styles.hiddenInput} onChange={importSettings} />
            </label>
            <button type="button" className={styles.reportBtn} onClick={resetSettings}>
              {t('planner', 'resetSettings')}
            </button>
          </div>
          {importStatus ? <p className={styles.loading}>{importStatus}</p> : null}
        </div>
        <div className={styles.reportCard}>
          <h3 className={styles.sectionTitle}>{t('planner', 'datePreview')}</h3>
          <div className={styles.reportRow}>
            <span>{t('planner', 'workedHours')}</span>
            <strong>{current.workedHours}</strong>
          </div>
          <div className={styles.reportRow}>
            <span>{t('planner', 'salaryRate')}</span>
            <strong>{currencySymbol(prefs.currency)}{current.salaryRate}</strong>
          </div>
          <div className={styles.reportRow}>
            <span>{t('planner', 'salaryAmount')}</span>
            <strong>{currencySymbol(prefs.currency)}{current.salaryAmount}</strong>
          </div>
        </div>

        <h2 className={styles.sectionTitle}>
          {t('planner', 'selectedDate')}: {parseIsoLocal(selectedDay).toLocaleDateString(locale)}
        </h2>
        {!editorOpened ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateText}>{t('planner', 'tapAddShift')}</p>
            <button
              type="button"
              className={styles.addShiftBtn}
              onClick={() => {
                if (selectedTemplate) {
                  applyTemplateToSelectedDay();
                } else {
                  applyDefaultsToSelectedDay();
                }
              }}
            >
              {t('planner', 'addShift')}
            </button>
          </div>
        ) : (
          <>
            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={current.hasShift}
                onChange={(e) => updateCurrent({ hasShift: e.target.checked })}
              />
              <span>{t('planner', 'hasShift')}</span>
            </label>

            <div className={styles.formRow}>
              <label>{t('planner', 'workedHours')}</label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={current.workedHours || ''}
                onChange={(e) => updateCurrent({ workedHours: Number(e.target.value || 0) })}
              />
            </div>

            <div className={styles.formRow}>
              <label>{t('planner', 'salaryRate')}</label>
              <input
                type="number"
                min={0}
                value={current.salaryRate || ''}
                onChange={(e) => updateCurrent({ salaryRate: Number(e.target.value || 0) })}
              />
            </div>

            <div className={styles.formRow}>
              <label>{t('planner', 'salaryAmount')}</label>
              <input
                type="number"
                min={0}
                value={current.salaryAmount || ''}
                onChange={(e) => updateCurrent({ salaryAmount: Number(e.target.value || 0) })}
              />
            </div>

            <div className={styles.formRow}>
              <label>{t('planner', 'note')}</label>
              <textarea
                rows={3}
                value={current.note}
                placeholder={t('planner', 'notePlaceholder')}
                onChange={(e) => updateCurrent({ note: e.target.value })}
              />
            </div>

            <button type="button" className={styles.saveBtn} onClick={onSave} disabled={saving}>
              {justSaved ? t('planner', 'saved') : saving ? '...' : t('planner', 'save')}
            </button>
          </>
        )}
      </section>}
      <div className={styles.spacer} />
    </div>
  );
};

export default CalendarPlanner;
