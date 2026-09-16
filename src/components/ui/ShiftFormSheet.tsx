import React, { useMemo, useState } from 'react';
import FormSheet from './FormSheet';
import { useTranslation } from '../../i18n/LanguageContext';
import type { PlannerCurrency } from '../../utils/formatters';
import { formatHoursMinutes, hoursFromTimeRange } from '../../utils/shiftDuration';
import styles from './FormSheet.module.css';
import extra from './ShiftFormSheet.module.css';

export type ShiftMode = 'range' | 'hours';

/**
 * Помилка, текст якої призначений людині.
 *
 * Звичайна помилка збереження показується загальним «не вдалося зберегти»:
 * `Save template failed: 500` людині нічого не каже. Але є відмови, які
 * пояснюють саме те, що треба виправити в цій формі, — наприклад, що шаблон із
 * такою назвою вже є. Такі кидаються цим класом і показуються дослівно.
 */
export class FormError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormError';
  }
}

export interface ShiftFormTemplate {
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

export interface ShiftFormValue {
  id: string;
  mode: ShiftMode;
  startTime: string;
  endTime: string;
  workedHours: number;
  salaryRate: number;
  salaryAmount: number;
  salaryCurrency: PlannerCurrency;
  name: string;
  symbol: string;
}

export interface ShiftFormPayload {
  mode: ShiftMode;
  startTime: string;
  endTime: string;
  workedHours: number;
  salaryRate: number;
  salaryAmount: number;
  salaryCurrency: PlannerCurrency;
  name: string;
  symbol: string;
  saveAsTemplate: boolean;
}

interface ShiftFormSheetProps {
  /** null — форма закрита; без `id` — нова зміна. */
  value: ShiftFormValue | null;
  /**
   * Що саме описує форма. Поля в зміни й шаблону однакові — назва, тривалість,
   * гроші, — тож форма одна: друга, майже така сама, розійшлася б із першою на
   * першій же правці.
   */
  kind?: 'shift' | 'template';
  dayLabel?: string;
  templates?: ShiftFormTemplate[];
  onClose: () => void;
  onSubmit: (payload: ShiftFormPayload) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const parseMoney = (raw: string): number => {
  const clean = raw.replace(/\s+/g, '').replace(',', '.');
  if (!clean) return 0;
  const value = Number(clean);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const moneyToInput = (value: number): string => (value > 0 ? String(value) : '');

/** Ціле число в межах; порожнє поле — нуль, а не NaN. */
const clampInt = (raw: string, max: number): number => {
  const value = Number.parseInt(raw.replace(/\D/g, ''), 10);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(max, value);
};

/**
 * Форма однієї зміни — і для нової, і для наявної.
 *
 * Замінює дві попередні: модалку в календарі, яка насправді редагувала **день**
 * (одна зміна на день, час не зберігався й підставлявся заново при кожному
 * відкритті), і аркуш правки з текстовим полем «08:00». Те поле мало
 * `inputMode="numeric"` — цифрову клавіатуру без двокрапки, — тож хвилини в
 * нього ввести було нічим, а набране поспіль «830» ставало вісьмастами
 * тридцятьма годинами.
 *
 * Тепер час вводиться двома `type="time"`, тривалість рахується з них і видно
 * одразу. Коли часу немає (зміна з шаблону «вісім годин»), режим «годинами» дає
 * окремі поля годин і хвилин — теж без жодної двокрапки.
 */
const ShiftFormSheet: React.FC<ShiftFormSheetProps> = ({
  value,
  kind = 'shift',
  dayLabel = '',
  templates = [],
  onClose,
  onSubmit,
  onDelete,
}) => {
  const { t } = useTranslation();
  const editing = Boolean(value?.id);
  const isTemplate = kind === 'template';

  const [mode, setMode] = useState<ShiftMode>(value?.mode ?? 'range');
  const [startTime, setStartTime] = useState(value?.startTime || '09:00');
  const [endTime, setEndTime] = useState(value?.endTime || '17:00');
  const [hoursPart, setHoursPart] = useState(() => String(Math.floor(value?.workedHours ?? 8)));
  const [minutesPart, setMinutesPart] = useState(() =>
    String(Math.round(((value?.workedHours ?? 8) % 1) * 60)),
  );
  const [name, setName] = useState(value?.name ?? '');
  const [symbol, setSymbol] = useState(value?.symbol ?? '');
  const [salaryCurrency, setSalaryCurrency] = useState<PlannerCurrency>(value?.salaryCurrency ?? 'UAH');
  const [rateInput, setRateInput] = useState(moneyToInput(value?.salaryRate ?? 0));
  const [amountInput, setAmountInput] = useState(moneyToInput(value?.salaryAmount ?? 0));
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const workedHours = useMemo(() => {
    if (mode === 'range') return hoursFromTimeRange(startTime, endTime);
    const hours = clampInt(hoursPart, 24);
    const minutes = clampInt(minutesPart, 59);
    return Math.min(24, hours + minutes / 60);
  }, [mode, startTime, endTime, hoursPart, minutesPart]);

  if (!value) return null;

  const applyTemplate = (template: ShiftFormTemplate) => {
    setName(template.name);
    setSymbol(template.symbol);
    setSalaryCurrency(template.salaryCurrency);
    setRateInput(moneyToInput(template.salaryRate));
    setAmountInput(moneyToInput(template.salaryAmount));
    if (template.isFullDay || !template.startTime || !template.endTime) {
      setMode('hours');
      setHoursPart(String(Math.floor(template.workedHours)));
      setMinutesPart(String(Math.round((template.workedHours % 1) * 60)));
      return;
    }
    setMode('range');
    setStartTime(template.startTime);
    setEndTime(template.endTime);
  };

  const handleSave = async () => {
    if (workedHours === null || workedHours <= 0) {
      setError(t('planner', 'shiftDurationInvalid'));
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSubmit({
        mode,
        startTime: mode === 'range' ? startTime : '',
        endTime: mode === 'range' ? endTime : '',
        workedHours,
        salaryRate: parseMoney(rateInput),
        salaryAmount: parseMoney(amountInput),
        salaryCurrency,
        name: name.trim(),
        symbol: symbol.trim(),
        saveAsTemplate,
      });
      onClose();
    } catch (e) {
      setError(e instanceof FormError ? e.message : t('addTx', 'saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete();
      onClose();
    } catch (e) {
      setError(e instanceof FormError ? e.message : t('addTx', 'saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const durationLabel =
    workedHours === null || workedHours <= 0
      ? t('planner', 'shiftDurationInvalid')
      : `${t('planner', 'workedHours')}: ${formatHoursMinutes(workedHours, {
          hours: t('planner', 'hoursShort'),
          minutes: t('planner', 'minutesShort'),
        })}`;

  return (
    <FormSheet
      title={
        isTemplate
          ? t('planner', editing ? 'templateEdit' : 'templateNew')
          : t('planner', editing ? 'shiftTitle' : 'addShift')
      }
      onClose={onClose}
      onSubmit={() => void handleSave()}
      submitLabel={t('addTx', 'save')}
      cancelLabel={t('addTx', 'cancel')}
      submitDisabled={saving}
      error={error || undefined}
    >
      {isTemplate ? null : <p className={extra.dayCaption}>{dayLabel}</p>}

      {/* Шаблон підставляє значення в цю саму форму — і при створенні, і при
          правці. Доки чіпи були лише в новій зміні, застосувати шаблон до вже
          наявної не було чим: доводилося видаляти її й заводити наново. */}
      {!isTemplate && templates.length > 0 ? (
        <div>
          <p className={styles.blockLabel}>{t('planner', 'templates')}</p>
          <div className={extra.templateChips}>
            {templates.map((template) => {
              const label = [template.name.trim(), template.symbol.trim()].filter(Boolean).join(' · ')
                || t('planner', 'shiftTitle');
              return (
                <button
                  key={template.id}
                  type="button"
                  className={extra.templateChip}
                  onClick={() => applyTemplate(template)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className={styles.group}>
        <label className={styles.row}>
          <span className={styles.rowLabel}>{t('subscriptions', 'name')}</span>
          <input
            className={styles.rowField}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="—"
          />
        </label>
        <label className={styles.row}>
          <span className={styles.rowLabel}>{t('planner', 'shiftSymbolLabel')}</span>
          <input
            className={styles.rowField}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            maxLength={4}
            placeholder="—"
          />
        </label>
      </div>

      <div className={styles.segment} role="group" aria-label={t('planner', 'shiftDurationTitle')}>
        {(['range', 'hours'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={styles.segmentBtn}
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
          >
            {t('planner', option === 'range' ? 'shiftModeRange' : 'shiftModeHours')}
          </button>
        ))}
      </div>

      <div className={styles.group}>
        {mode === 'range' ? (
          <>
            <label className={styles.row}>
              <span className={styles.rowLabel}>{t('planner', 'timeStart')}</span>
              <input
                type="time"
                className={styles.rowDatePill}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className={styles.row}>
              <span className={styles.rowLabel}>{t('planner', 'timeEnd')}</span>
              <input
                type="time"
                className={styles.rowDatePill}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </>
        ) : (
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('planner', 'workedHours')}</span>
            <div className={extra.durationPair}>
              <input
                className={extra.durationInput}
                inputMode="numeric"
                value={hoursPart}
                onChange={(e) => setHoursPart(e.target.value.replace(/\D/g, '').slice(0, 2))}
                aria-label={t('planner', 'hoursShort')}
              />
              <span className={extra.durationUnit}>{t('planner', 'hoursShort')}</span>
              <input
                className={extra.durationInput}
                inputMode="numeric"
                value={minutesPart}
                onChange={(e) => setMinutesPart(e.target.value.replace(/\D/g, '').slice(0, 2))}
                aria-label={t('planner', 'minutesShort')}
              />
              <span className={extra.durationUnit}>{t('planner', 'minutesShort')}</span>
            </div>
          </div>
        )}
      </div>
      <p className={styles.groupCaption}>
        {mode === 'range' ? `${durationLabel}${t('planner', 'shiftOvernightHint')}` : durationLabel}
      </p>

      <div className={styles.group}>
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t('planner', 'currency')}</span>
          <div className={extra.currencyPair} role="group" aria-label={t('planner', 'currency')}>
            {(['UAH', 'PLN'] as const).map((code) => (
              <button
                key={code}
                type="button"
                className={extra.currencyBtn}
                aria-pressed={salaryCurrency === code}
                onClick={() => setSalaryCurrency(code)}
              >
                {code === 'UAH' ? '₴' : 'zł'}
              </button>
            ))}
          </div>
        </div>
        <label className={styles.row}>
          <span className={styles.rowLabel}>{t('planner', 'salaryRate')}</span>
          <input
            className={styles.rowField}
            inputMode="decimal"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            placeholder="0"
          />
        </label>
        <label className={styles.row}>
          <span className={styles.rowLabel}>{t('planner', 'salaryAmount')}</span>
          <input
            className={styles.rowField}
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0"
          />
        </label>
      </div>
      <p className={styles.groupCaption}>{t('planner', 'salaryForReportHint')}</p>

      {/* Шаблон створюється лише тут і лише навмисно. Раніше будь-яка названа
          зміна мовчки ставала шаблоном, і список заростав одноразовими. */}
      {!isTemplate && !editing ? (
        <div className={styles.group}>
          <label className={styles.row}>
            <span className={styles.rowLabel}>{t('planner', 'saveAsTemplate')}</span>
            <input
              type="checkbox"
              checked={saveAsTemplate}
              onChange={(e) => setSaveAsTemplate(e.target.checked)}
            />
          </label>
        </div>
      ) : null}

      {editing && onDelete ? (
        <button type="button" className={styles.deleteRow} disabled={saving} onClick={() => void handleDelete()}>
          {t('planner', isTemplate ? 'deleteTemplate' : 'deleteShift')}
        </button>
      ) : null}
    </FormSheet>
  );
};

export default ShiftFormSheet;
