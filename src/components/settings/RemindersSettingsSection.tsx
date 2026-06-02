import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { getReminders, updateReminder, type Reminder } from '../../api/client';
import { groupReminders } from '../../utils/settingsReminders';
import ReminderAccordionItem from './ReminderAccordionItem';
import { useSaveSetting } from './useSaveSetting';
import styles from './RemindersSettingsSection.module.css';

const RemindersSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const { saving, run } = useSaveSetting();
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rm = await getReminders();
        if (!cancelled) setReminders(rm);
      } catch {
        // ignore temporary network issues
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => groupReminders(reminders), [reminders]);

  const patchReminder = (id: string, patch: Partial<Reminder>) =>
    void run(
      () => updateReminder(id, patch),
      (next) => setReminders((prev) => prev.map((r) => (r.id === id ? next : r))),
    );

  if (reminders.length === 0) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionLabel}>{t('settings', 'sectionReminders')}</div>
      {groups.map((group) => (
        <div key={group.group} className={styles.group}>
          <div className={styles.groupLabel}>{t('settings', group.titleKey)}</div>
          <div className={styles.card}>
            {group.reminders.map((reminder) => (
              <ReminderAccordionItem
                key={reminder.id}
                reminder={reminder}
                saving={saving}
                onPatch={(patch) => patchReminder(reminder.id, patch)}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
};

export default RemindersSettingsSection;
