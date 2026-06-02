import type { Reminder, ReminderKind } from '../api/client';
import { translations } from '../i18n/translations';

type SettingsKey = keyof typeof translations['uk']['settings'];

export type ReminderGroup = 'expenses' | 'planner' | 'fx';

export type ReminderParamMeta = {
  labelKey: SettingsKey;
  min: number;
  max: number;
};

export type ReminderMeta = {
  kind: ReminderKind;
  titleKey: SettingsKey;
  descriptionKey: SettingsKey;
  group: ReminderGroup;
  hasTime: boolean;
  param?: ReminderParamMeta;
};

const REMINDER_META: Record<ReminderKind, ReminderMeta> = {
  daily: {
    kind: 'daily',
    titleKey: 'dailyReminder',
    descriptionKey: 'reminderDescDaily',
    group: 'expenses',
    hasTime: true,
  },
  subscriptions: {
    kind: 'subscriptions',
    titleKey: 'subscriptionsReminder',
    descriptionKey: 'reminderDescSubscriptions',
    group: 'expenses',
    hasTime: true,
    param: { labelKey: 'paramDaysBefore', min: 0, max: 31 },
  },
  inactivity: {
    kind: 'inactivity',
    titleKey: 'reminderInactivity',
    descriptionKey: 'reminderDescInactivity',
    group: 'expenses',
    hasTime: true,
    param: { labelKey: 'paramInactivityDays', min: 0, max: 90 },
  },
  shift_evening_before: {
    kind: 'shift_evening_before',
    titleKey: 'reminderShiftEveningBefore',
    descriptionKey: 'reminderDescShiftEvening',
    group: 'planner',
    hasTime: true,
    param: { labelKey: 'paramDaysBefore', min: 0, max: 30 },
  },
  shift_unclosed: {
    kind: 'shift_unclosed',
    titleKey: 'reminderShiftUnclosed',
    descriptionKey: 'reminderDescShiftUnclosed',
    group: 'planner',
    hasTime: true,
  },
  fx_change: {
    kind: 'fx_change',
    titleKey: 'reminderFxChange',
    descriptionKey: 'reminderDescFxChange',
    group: 'fx',
    hasTime: true,
    param: { labelKey: 'paramFxThreshold', min: 1, max: 100 },
  },
};

const GROUP_ORDER: ReminderGroup[] = ['expenses', 'planner', 'fx'];

const GROUP_TITLE_KEY: Record<ReminderGroup, SettingsKey> = {
  expenses: 'reminderGroupExpenses',
  planner: 'reminderGroupPlanner',
  fx: 'reminderGroupFx',
};

export const getReminderMeta = (kind: ReminderKind): ReminderMeta =>
  REMINDER_META[kind] ?? REMINDER_META.daily;

export const getReminderGroupTitleKey = (group: ReminderGroup): SettingsKey =>
  GROUP_TITLE_KEY[group];

export type ReminderGroupBucket = {
  group: ReminderGroup;
  titleKey: SettingsKey;
  reminders: Reminder[];
};

export const groupReminders = (reminders: Reminder[]): ReminderGroupBucket[] => {
  const buckets = new Map<ReminderGroup, Reminder[]>();
  for (const reminder of reminders) {
    const { group } = getReminderMeta(reminder.kind);
    const list = buckets.get(group) ?? [];
    list.push(reminder);
    buckets.set(group, list);
  }
  return GROUP_ORDER.filter((group) => buckets.has(group)).map((group) => ({
    group,
    titleKey: GROUP_TITLE_KEY[group],
    reminders: buckets.get(group) ?? [],
  }));
};

export const clampReminderParam = (kind: ReminderKind, value: number): number => {
  const meta = getReminderMeta(kind);
  if (!meta.param) return Math.trunc(value || 0);
  const next = Math.trunc(value || 0);
  return Math.min(meta.param.max, Math.max(meta.param.min, next));
};
