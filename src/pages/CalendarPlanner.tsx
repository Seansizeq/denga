import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import styles from './CalendarPlanner.module.css';

interface DayPlan {
  hasShift: boolean;
  salaryRate: number;
  salaryAmount: number;
  note: string;
}

type PlannerStore = Record<string, DayPlan>;

const API_URL = import.meta.env.VITE_API_URL ?? '';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const monthLabel = (value: string, locale: string): string => {
  const [year, month] = value.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
};

const buildDaysForMonth = (monthValue: string): string[] => {
  const [year, month] = monthValue.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    return `${year}-${String(month).padStart(2, '0')}-${day}`;
  });
};

const CalendarPlanner: React.FC = () => {
  const { t, locale } = useTranslation();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(todayIso());
  const [store, setStore] = useState<PlannerStore>({});
  const [justSaved, setJustSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const days = useMemo(() => buildDaysForMonth(month), [month]);
  const report = useMemo(() => {
    return days.reduce(
      (acc, dayIso) => {
        const day = store[dayIso];
        if (!day?.hasShift) return acc;

        const salaryAmount = Number(day.salaryAmount) || 0;
        const salaryRate = Number(day.salaryRate) || 0;
        const hours = salaryRate > 0 && salaryAmount > 0 ? salaryAmount / salaryRate : 0;

        return {
          hours: acc.hours + hours,
          salary: acc.salary + salaryAmount,
        };
      },
      { hours: 0, salary: 0 }
    );
  }, [days, store]);

  const current = store[selectedDay] ?? {
    hasShift: false,
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
        if (!response.ok) {
          throw new Error(`Planner load failed: ${response.status}`);
        }
        const rows = (await response.json()) as Array<{
          day: string;
          hasShift: boolean;
          salaryRate: number;
          salaryAmount: number;
          note: string;
        }>;
        if (cancelled) return;
        const next: PlannerStore = {};
        for (const row of rows) {
          next[row.day] = {
            hasShift: Boolean(row.hasShift),
            salaryRate: Number(row.salaryRate) || 0,
            salaryAmount: Number(row.salaryAmount) || 0,
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
    setStore((prev) => ({
      ...prev,
      [selectedDay]: {
        ...(prev[selectedDay] ?? {
          hasShift: false,
          salaryRate: 0,
          salaryAmount: 0,
          note: '',
        }),
        ...patch,
      },
    }));
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
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1300);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('planner', 'title')}</h1>
        <p className={styles.subtitle}>{t('planner', 'subtitle')}</p>
      </header>

      <section className={styles.panel}>
        <div className={styles.monthRow}>
          <span className={styles.monthLabel}>{monthLabel(month, locale)}</span>
          <div className={styles.monthControls}>
            <button
              type="button"
              className={styles.reportBtn}
              onClick={() => setShowReport((prev) => !prev)}
            >
              {t('planner', 'report')}
            </button>
            <input
              type="month"
              className={styles.monthInput}
              value={month}
              onChange={(e) => {
                const nextMonth = e.target.value;
                setMonth(nextMonth);
                const [year, m] = nextMonth.split('-');
                setSelectedDay(`${year}-${m}-01`);
              }}
            />
          </div>
        </div>

        <div className={styles.grid}>
          {days.map((dayIso) => {
            const dayNum = Number(dayIso.slice(-2));
            const active = dayIso === selectedDay;
            const hasData = Boolean(store[dayIso]?.hasShift || store[dayIso]?.salaryAmount || store[dayIso]?.note);
            return (
              <button
                key={dayIso}
                type="button"
                className={`${styles.day} ${active ? styles.dayActive : ''}`}
                onClick={() => setSelectedDay(dayIso)}
              >
                {dayNum}
                {hasData && <span className={styles.dot} />}
              </button>
            );
          })}
        </div>
        {loading && <p className={styles.loading}>Loading...</p>}
        {showReport && (
          <div className={styles.reportCard}>
            <div className={styles.reportRow}>
              <span>{t('planner', 'workedHours')}</span>
              <strong>{report.hours.toFixed(1)}</strong>
            </div>
            <div className={styles.reportRow}>
              <span>{t('planner', 'expectedSalary')}</span>
              <strong>₴{report.salary.toFixed(2)}</strong>
            </div>
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>
          {t('planner', 'selectedDate')}: {new Date(selectedDay).toLocaleDateString(locale)}
        </h2>

        <label className={styles.switchRow}>
          <input
            type="checkbox"
            checked={current.hasShift}
            onChange={(e) => updateCurrent({ hasShift: e.target.checked })}
          />
          <span>{t('planner', 'hasShift')}</span>
        </label>

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
      </section>
      <div className={styles.spacer} />
    </div>
  );
};

export default CalendarPlanner;
