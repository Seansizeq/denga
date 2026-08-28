import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { localIsoDate } from '../../utils/dateRanges';
import { useTranslation } from '../../i18n/LanguageContext';
import styles from './HistoryCalendar.module.css';

interface HistoryCalendarProps {
  /** Дні (YYYY-MM-DD), у яких є хоч одна операція. */
  activeDays: ReadonlySet<string>;
  /** Обраний день або null, коли показано всю історію. */
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}

const monthKeyOf = (iso: string) => iso.slice(0, 7);

/** Перший день місяця, з якого починається сітка. */
const parseMonth = (monthKey: string): Date => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1);
};

/**
 * Клітинки місяця з тиждня, що починається з понеділка. `null` — порожнє місце
 * перед першим числом.
 */
const buildCells = (monthKey: string): Array<string | null> => {
  const first = parseMonth(monthKey);
  const year = first.getFullYear();
  const month = first.getMonth();
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => localIsoDate(new Date(year, month, i + 1)));
  return [...Array.from({ length: offset }, () => null), ...days];
};

const HistoryCalendar: React.FC<HistoryCalendarProps> = ({ activeDays, selectedDay, onSelectDay }) => {
  const { t, locale } = useTranslation();
  const today = localIsoDate();
  const [open, setOpen] = useState(false);
  // Відкриваємо на місяці обраного дня, інакше на поточному.
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(selectedDay ?? today));

  const cells = useMemo(() => buildCells(monthKey), [monthKey]);

  const weekdays = useMemo(() => {
    // 1 січня 2024 — понеділок, тож тиждень починається саме з нього.
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
        new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
      )
    );
  }, [locale]);

  // Назва місяця й рік окремо: локальний формат дав би «липень 2026 р.», а
  // `capitalize` перетворював те «р.» на «Р.».
  const monthLabel = useMemo(() => {
    const d = parseMonth(monthKey);
    const name = new Intl.DateTimeFormat(locale, { month: 'long' }).format(d);
    return `${name} ${d.getFullYear()}`;
  }, [monthKey, locale]);

  const shiftMonth = (delta: number) => {
    const d = parseMonth(monthKey);
    d.setMonth(d.getMonth() + delta);
    setMonthKey(localIsoDate(d).slice(0, 7));
  };

  const formatDay = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long' });

  return (
    <>
      <div className={styles.bar}>
        <button
          type="button"
          className={`${styles.toggle} ${open ? styles.toggleOpen : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <CalendarDays size={16} strokeWidth={2.2} aria-hidden="true" />
          {t('history', 'calendar')}
          <ChevronDown
            size={15}
            strokeWidth={2.4}
            aria-hidden="true"
            className={`${styles.chevron} ${open ? styles.chevronUp : ''}`}
          />
        </button>

        {selectedDay ? (
          <button
            type="button"
            className={styles.selected}
            onClick={() => onSelectDay(null)}
            aria-label={t('history', 'clearDay')}
          >
            {formatDay(selectedDay)}
            <span className={styles.selectedClear}>
              <X size={15} strokeWidth={2.4} aria-hidden="true" />
            </span>
          </button>
        ) : null}
      </div>

      {open ? (
        <div className={styles.panel}>
          <div className={styles.monthRow}>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => shiftMonth(-1)}
              aria-label={t('history', 'prevMonth')}
            >
              <ChevronLeft size={17} strokeWidth={2.4} aria-hidden="true" />
            </button>
            <span className={styles.monthName}>{monthLabel}</span>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => shiftMonth(1)}
              aria-label={t('history', 'nextMonth')}
            >
              <ChevronRight size={17} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>

          <div className={styles.weekdays}>
            {weekdays.map((w) => (
              <span key={w} className={styles.weekday}>
                {w}
              </span>
            ))}
          </div>

          <div className={styles.grid}>
            {cells.map((iso, i) => {
              if (!iso) return <div key={`gap-${i}`} className={styles.empty} />;
              const has = activeDays.has(iso);
              const isSelected = iso === selectedDay;
              const classes = [
                styles.day,
                has ? styles.dayActive : styles.dayEmpty,
                iso === today ? styles.dayToday : '',
                isSelected ? styles.daySelected : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={iso}
                  type="button"
                  className={classes}
                  // Порожній день фільтрувати нема сенсу — список став би порожнім.
                  disabled={!has}
                  aria-pressed={isSelected}
                  onClick={() => onSelectDay(isSelected ? null : iso)}
                >
                  {Number(iso.slice(8, 10))}
                  {has && !isSelected ? <span className={styles.dot} /> : null}
                </button>
              );
            })}
          </div>

          <p className={styles.hint}>{t('history', 'calendarHint')}</p>
        </div>
      ) : null}
    </>
  );
};

export default HistoryCalendar;
