import React, { useState } from 'react';
import BottomSheet from './BottomSheet';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatWorkedHoursInput, parseWorkedHoursInput } from '../../utils/workedHours';
import styles from './ShiftEditSheet.module.css';

export interface EditableShift {
  id: string;
  workedHours: number;
  salaryAmount: number;
  note: string;
}

interface ShiftEditSheetProps {
  shift: EditableShift | null;
  onClose: () => void;
  onSave: (next: { workedHours: number; salaryAmount: number; note: string }) => Promise<void>;
}

const parseAmount = (raw: string): number | null => {
  const clean = raw.replace(/\s+/g, '').replace(',', '.');
  if (!clean) return 0;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Заміна трьом `window.prompt` поспіль: одна форма, видно всі поля одразу,
 * можна виправити помилку не починаючи спочатку. `prompt` до того ж доступний
 * не в кожному Telegram-клієнті.
 */
const ShiftEditSheet: React.FC<ShiftEditSheetProps> = ({ shift, onClose, onSave }) => {
  const { t } = useTranslation();
  const [hours, setHours] = useState(() => (shift ? formatWorkedHoursInput(shift.workedHours) : ''));
  const [amount, setAmount] = useState(() => (shift ? String(shift.salaryAmount) : ''));
  const [note, setNote] = useState(() => shift?.note ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!shift) return null;

  const handleSave = async () => {
    const parsedHours = parseWorkedHoursInput(hours);
    if (parsedHours === null) {
      setError(t('planner', 'editShiftHoursInvalid'));
      return;
    }
    const parsedAmount = parseAmount(amount);
    if (parsedAmount === null) {
      setError(t('planner', 'editShiftAmountPrompt'));
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSave({ workedHours: parsedHours, salaryAmount: parsedAmount, note: note.trim() });
      onClose();
    } catch {
      setError(t('addTx', 'saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open
      title={t('planner', 'editShift')}
      onClose={onClose}
      closeLabel={t('addTx', 'cancel')}
    >
      <div className={styles.form}>
        {error ? <p className={styles.error}>{error}</p> : null}

        <label className={styles.field}>
          <span className={styles.label}>{t('planner', 'editShiftHoursPrompt')}</span>
          <input
            className={styles.input}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            inputMode="numeric"
            placeholder="08:00"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t('planner', 'editShiftAmountPrompt')}</span>
          <input
            className={styles.input}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t('planner', 'editShiftNotePrompt')}</span>
          <input
            className={styles.input}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={120}
          />
        </label>

        <button
          type="button"
          className={styles.saveBtn}
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {t('addTx', 'save')}
        </button>
      </div>
    </BottomSheet>
  );
};

export default ShiftEditSheet;
