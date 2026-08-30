import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import {
  getReminders,
  getReportSettings,
  updateReminder,
  updateReportSettings,
  type Reminder,
  type ReportSettings,
} from '../../api/client';
import { clampReminderParam, getReminderMeta, visibleReminders } from '../../utils/settingsReminders';
import Switch from '../ui/Switch';
import SettingsSection from './SettingsSection';
import SettingsRow from './SettingsRow';
import { useSaveSetting } from './useSaveSetting';
import styles from './NotificationsSection.module.css';

const DEFAULT_REPORTS: ReportSettings = {
  autoWeekly: true,
  autoMonthly: true,
  reportCurrency: 'UAH',
  sendTime: '21:00',
};

/**
 * Усе, що бот надсилає сам — нагадування і авто-звіти — живе в одній секції:
 * для користувача це одне питання «коли ти мені пишеш», а не два різні екрани.
 * Час один на всі нагадування: окремий пікер під кожним давав шість полів
 * заради значення, яке ніхто не розводив по різних годинах.
 */
const NotificationsSection: React.FC = () => {
  const { t, displayCurrency } = useTranslation();
  const { saving, run } = useSaveSetting();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [reports, setReports] = useState<ReportSettings>(DEFAULT_REPORTS);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [rm, rs] = await Promise.all([getReminders(), getReportSettings()]);
        if (cancelled) return;
        setReminders(rm);
        setReports(rs);
      } catch {
        // ignore temporary network issues
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Валюта звіту не має власного перемикача — вона просто йде за валютою застосунку.
  useEffect(() => {
    if (reports.reportCurrency === displayCurrency) return;
    void run(
      () => updateReportSettings({ reportCurrency: displayCurrency }),
      (next) => setReports(next),
      { silent: true },
    );
  }, [displayCurrency, reports.reportCurrency, run]);

  const items = useMemo(() => visibleReminders(reminders), [reminders]);

  const applyReminder = (next: Reminder) =>
    setReminders((prev) => prev.map((r) => (r.id === next.id ? next : r)));

  const patchReminder = (reminder: Reminder, patch: Partial<Reminder>) =>
    void run(() => updateReminder(reminder.id, patch), applyReminder);

  const patchReports = (next: Partial<ReportSettings>) =>
    void run(() => updateReportSettings(next), setReports);

  // Одне поле часу на всю секцію: зберігаємо його в кожне нагадування одразу.
  const sharedTime = items[0]?.timeHHMM ?? '21:00';
  const [timeInput, setTimeInput] = useState(sharedTime);
  useEffect(() => {
    setTimeInput(sharedTime);
  }, [sharedTime]);

  const commitTime = () => {
    if (!timeInput || timeInput === sharedTime) return;
    const stale = items.filter((reminder) => reminder.timeHHMM !== timeInput);
    if (stale.length === 0) return;
    void run(async () => {
      const updated = await Promise.all(
        stale.map((reminder) => updateReminder(reminder.id, { timeHHMM: timeInput })),
      );
      return updated;
    }, (updated) => updated.forEach(applyReminder));
  };

  const subscriptions = items.find((reminder) => reminder.kind === 'subscriptions');
  const subscriptionsLeadDays = subscriptions?.leadDays;
  const [leadDaysInput, setLeadDaysInput] = useState('1');
  useEffect(() => {
    if (subscriptionsLeadDays !== undefined) setLeadDaysInput(String(subscriptionsLeadDays));
  }, [subscriptionsLeadDays]);

  const commitLeadDays = () => {
    if (!subscriptions) return;
    const next = clampReminderParam(subscriptions.kind, Number(leadDaysInput));
    setLeadDaysInput(String(next));
    if (next !== subscriptions.leadDays) patchReminder(subscriptions, { leadDays: next });
  };

  const anyReminderOn = items.some((reminder) => reminder.enabled);

  return (
    <SettingsSection label={t('settings', 'sectionNotifications')}>
      {items.map((reminder) => {
        const meta = getReminderMeta(reminder.kind);
        if (!meta) return null;
        return (
          <SettingsRow
            key={reminder.id}
            label={t('settings', meta.titleKey)}
            sublabel={t('settings', meta.descriptionKey)}
            trailing={
              <Switch
                checked={reminder.enabled}
                disabled={saving}
                onChange={(next) => patchReminder(reminder, { enabled: next })}
                aria-label={t('settings', meta.titleKey)}
              />
            }
          />
        );
      })}

      {subscriptions?.enabled ? (
        <SettingsRow
          label={t('settings', 'paramDaysBefore')}
          trailing={
            <input
              className={styles.numberInput}
              type="number"
              inputMode="numeric"
              min={0}
              max={31}
              step={1}
              value={leadDaysInput}
              onChange={(e) => setLeadDaysInput(e.target.value)}
              onBlur={commitLeadDays}
            />
          }
        />
      ) : null}

      {anyReminderOn ? (
        <SettingsRow
          label={t('settings', 'reminderTime')}
          trailing={
            <input
              className={styles.timeInput}
              type="time"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              onBlur={commitTime}
            />
          }
        />
      ) : null}

      <SettingsRow
        label={t('settings', 'weeklyAutoReport')}
        trailing={
          <Switch
            checked={reports.autoWeekly}
            disabled={saving}
            onChange={(v) => patchReports({ autoWeekly: v })}
            aria-label={t('settings', 'weeklyAutoReport')}
          />
        }
      />
      <SettingsRow
        label={t('settings', 'monthlyAutoReport')}
        trailing={
          <Switch
            checked={reports.autoMonthly}
            disabled={saving}
            onChange={(v) => patchReports({ autoMonthly: v })}
            aria-label={t('settings', 'monthlyAutoReport')}
          />
        }
      />
    </SettingsSection>
  );
};

export default NotificationsSection;
