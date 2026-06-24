import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import type { Reminder } from '../../api/client';
import { getReminderMeta, clampReminderParam } from '../../utils/settingsReminders';
import Switch from '../ui/Switch';
import styles from './ReminderAccordionItem.module.css';

interface ReminderItemProps {
  reminder: Reminder;
  saving: boolean;
  onPatch: (patch: Partial<Reminder>) => void;
}

const ReminderItem: React.FC<ReminderItemProps> = ({ reminder, saving, onPatch }) => {
  const { t } = useTranslation();
  const meta = getReminderMeta(reminder.kind);

  // Local input state so typing is free — we only save when the field loses focus,
  // not on every keystroke (which would clamp/save mid-typing and block input).
  const [leadDaysInput, setLeadDaysInput] = useState(String(reminder.leadDays));
  const [timeInput, setTimeInput] = useState(reminder.timeHHMM);

  useEffect(() => {
    setLeadDaysInput(String(reminder.leadDays));
  }, [reminder.leadDays]);
  useEffect(() => {
    setTimeInput(reminder.timeHHMM);
  }, [reminder.timeHHMM]);

  const commitLeadDays = () => {
    const next = clampReminderParam(reminder.kind, Number(leadDaysInput));
    setLeadDaysInput(String(next));
    if (next !== reminder.leadDays) onPatch({ leadDays: next });
  };

  const commitTime = () => {
    if (timeInput && timeInput !== reminder.timeHHMM) onPatch({ timeHHMM: timeInput });
  };

  return (
    <div className={`${styles.item} ${reminder.enabled ? '' : styles.itemMuted}`}>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <span className={styles.title}>{t('settings', meta.titleKey)}</span>
          <p className={styles.description}>{t('settings', meta.descriptionKey)}</p>
        </div>
        <Switch
          checked={reminder.enabled}
          disabled={saving}
          onChange={(next) => onPatch({ enabled: next })}
          aria-label={t('settings', meta.titleKey)}
        />
      </div>

      {reminder.enabled ? (
        <div className={styles.body}>
          {meta.hasTime ? (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('settings', 'reminderTimeLabel')}</span>
              <input
                className={styles.timeInput}
                type="time"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                onBlur={commitTime}
              />
            </div>
          ) : null}
          {meta.param ? (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('settings', meta.param.labelKey)}</span>
              <input
                className={styles.numberInput}
                type="number"
                inputMode="numeric"
                min={meta.param.min}
                max={meta.param.max}
                step={1}
                value={leadDaysInput}
                onChange={(e) => setLeadDaysInput(e.target.value)}
                onBlur={commitLeadDays}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default ReminderItem;
