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
  param?: ReminderParamMeta;
};

/**
 * Сервер тримає більше видів нагадувань, ніж показує застосунок (курс валют,
 * зміни планера, «немає витрат N днів»). Усі вони вимкнені за замовчуванням і
 * лише роздували екран, тож налаштування лишилися тільки для тих двох, якими
 * справді користуються. Решта живе на сервері зі своїми дефолтами.
 */
const REMINDER_META: Partial<Record<ReminderKind, ReminderMeta>> = {
  daily: {
    kind: 'daily',
    titleKey: 'dailyReminder',
    descriptionKey: 'reminderDescDaily',
  },
  subscriptions: {
    kind: 'subscriptions',
    titleKey: 'subscriptionsReminder',
    descriptionKey: 'reminderDescSubscriptions',
    param: { labelKey: 'paramDaysBefore', min: 0, max: 31 },
  },
};

// Порядок на екрані, а не порядок із бази.
const VISIBLE_KINDS: ReminderKind[] = ['daily', 'subscriptions'];

export const getReminderMeta = (kind: ReminderKind): ReminderMeta | undefined => REMINDER_META[kind];

/** Тільки ті нагадування, які має сенс показувати, у сталому порядку. */
export const visibleReminders = (reminders: Reminder[]): Reminder[] =>
  VISIBLE_KINDS.map((kind) => reminders.find((reminder) => reminder.kind === kind)).filter(
    (reminder): reminder is Reminder => Boolean(reminder),
  );

export const clampReminderParam = (kind: ReminderKind, value: number): number => {
  const param = getReminderMeta(kind)?.param;
  const next = Math.trunc(value || 0);
  if (!param) return next;
  return Math.min(param.max, Math.max(param.min, next));
};
