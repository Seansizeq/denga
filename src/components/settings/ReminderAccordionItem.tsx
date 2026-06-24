import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import type { Reminder } from '../../api/client';
import { getReminderMeta, clampReminderParam } from '../../utils/settingsReminders';
import Switch from '../ui/Switch';
import styles from './ReminderAccordionItem.module.css';

interface ReminderAccordionItemProps {
  reminder: Reminder;
  saving: boolean;
  onPatch: (patch: Partial<Reminder>) => void;
}

const ReminderAccordionItem: React.FC<ReminderAccordionItemProps> = ({ reminder, saving, onPatch }) => {
  const { t } = useTranslation();
  const meta = getReminderMeta(reminder.kind);
  const [expanded, setExpanded] = useState(reminder.enabled);

  const showBody = reminder.enabled && expanded;

  const handleToggle = (next: boolean) => {
    if (next) setExpanded(true);
    onPatch({ enabled: next });
  };

  return (
    <div className={`${styles.item} ${reminder.enabled ? '' : styles.itemMuted}`}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.headerMain}
          onClick={() => reminder.enabled && setExpanded((v) => !v)}
          disabled={!reminder.enabled}
          aria-expanded={showBody}
        >
          <span className={styles.title}>{t('settings', meta.titleKey)}</span>
          {reminder.enabled ? (
            <ChevronDown
              size={18}
              strokeWidth={2.2}
              className={`${styles.chevron} ${showBody ? '' : styles.chevronClosed}`}
            />
          ) : null}
        </button>
        <Switch
          checked={reminder.enabled}
          disabled={saving}
          onChange={handleToggle}
          aria-label={t('settings', meta.titleKey)}
        />
      </div>

      {showBody ? (
        <div className={styles.body}>
          <p className={styles.description}>{t('settings', meta.descriptionKey)}</p>
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

export default ReminderAccordionItem;
