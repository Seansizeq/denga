import type { Reminder, ReminderKind } from '../api/client';
import { translations } from '../i18n/translations';

type SettingsKey = keyof typeof translations['uk']['settings'];

export type ReminderParamMeta = {
  labelKey: SettingsKey;
  min: number;
  max: number;
};

export type ReminderMeta = {
  kind: ReminderKind;
  titleKey: SettingsKey;
  descriptionKey: SettingsKey;
  hasTime: boolean;
  param?: ReminderParamMeta;
};

const REMINDER_META: Record<ReminderKind, ReminderMeta> = {
  daily: {
    kind: 'daily',
    titleKey: 'dailyReminder',
    descriptionKey: 'reminderDescDaily',
    hasTime: true,
  },
  subscriptions: {
    kind: 'subscriptions',
    titleKey: 'subscriptionsReminder',
    descriptionKey: 'reminderDescSubscriptions',
    hasTime: true,
    param: { labelKey: 'paramDaysBefore', min: 0, max: 31 },
  },
  inactivity: {
    kind: 'inactivity',
    titleKey: 'reminderInactivity',
    descriptionKey: 'reminderDescInactivity',
    hasTime: true,
    param: { labelKey: 'paramInactivityDays', min: 0, max: 90 },
  },
  fx_change: {
    kind: 'fx_change',
    titleKey: 'reminderFxChange',
    descriptionKey: 'reminderDescFxChange',
    hasTime: true,
    param: { labelKey: 'paramFxThreshold', min: 1, max: 100 },
  },
};

const REMINDER_ORDER: ReminderKind[] = ['daily', 'subscriptions', 'inactivity', 'fx_change'];

export const getReminderMeta = (kind: ReminderKind): ReminderMeta =>
  REMINDER_META[kind] ?? REMINDER_META.daily;

/** Returns the known reminders in a stable display order, dropping any unknown/legacy kinds. */
export const orderReminders = (reminders: Reminder[]): Reminder[] => {
  const byKind = new Map<ReminderKind, Reminder>();
  for (const reminder of reminders) {
    if (REMINDER_META[reminder.kind]) byKind.set(reminder.kind, reminder);
  }
  return REMINDER_ORDER.map((kind) => byKind.get(kind)).filter(
    (reminder): reminder is Reminder => Boolean(reminder),
  );
};

export const clampReminderParam = (kind: ReminderKind, value: number): number => {
  const meta = getReminderMeta(kind);
  if (!meta.param) return Math.trunc(value || 0);
  const next = Math.trunc(value || 0);
  return Math.min(meta.param.max, Math.max(meta.param.min, next));
};
