import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { getReminders, updateReminder, type Reminder } from '../../api/client';
import { orderReminders } from '../../utils/settingsReminders';
import ReminderItem from './ReminderAccordionItem';
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

  const ordered = orderReminders(reminders);

  const patchReminder = (id: string, patch: Partial<Reminder>) =>
    void run(
      () => updateReminder(id, patch),
      (next) => setReminders((prev) => prev.map((r) => (r.id === id ? next : r))),
    );

  if (ordered.length === 0) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionLabel}>{t('settings', 'sectionReminders')}</div>
      <p className={styles.sectionHint}>{t('settings', 'remindersHint')}</p>
      <div className={styles.card}>
        {ordered.map((reminder) => (
          <ReminderItem
            key={reminder.id}
            reminder={reminder}
            saving={saving}
            onPatch={(patch) => patchReminder(reminder.id, patch)}
          />
        ))}
      </div>
    </section>
  );
};

export default RemindersSettingsSection;
