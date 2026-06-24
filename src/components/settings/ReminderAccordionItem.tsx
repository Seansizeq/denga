import React from 'react';
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
                value={reminder.timeHHMM}
                disabled={saving}
                onChange={(e) => onPatch({ timeHHMM: e.target.value })}
              />
            </div>
          ) : null}
          {meta.param ? (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('settings', meta.param.labelKey)}</span>
              <input
                className={styles.numberInput}
                type="number"
                min={meta.param.min}
                max={meta.param.max}
                step={1}
                value={reminder.leadDays}
                disabled={saving}
                onChange={(e) =>
                  onPatch({ leadDays: clampReminderParam(reminder.kind, Number(e.target.value)) })
                }
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default ReminderItem;
