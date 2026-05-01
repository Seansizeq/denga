import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n/LanguageContext';
import { LANGUAGES, LANGUAGE_LABELS, LANGUAGE_FLAGS } from '../i18n/translations';
import type { Language } from '../i18n/translations';
import type { DisplayCurrency } from '../utils/formatters';
import { useTelegramFullscreen } from '../hooks/useTelegramFullscreen';
import type { TelegramWindow } from '../types/telegram';
import {
  getReportSettings,
  updateReportSettings,
  sendWeeklyReportNow,
  sendMonthlyReportNow,
  getReminders,
  updateReminder,
  type ReportSettings,
  type Reminder,
  type ReminderKind,
} from '../api/client';
import styles from './Settings.module.css';

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev';
const DISPLAY_CURRENCIES: DisplayCurrency[] = ['UAH', 'PLN', 'USD'];

const reminderTitleKey = (kind: ReminderKind) => {
  switch (kind) {
    case 'daily':
      return 'dailyReminder' as const;
    case 'subscriptions':
      return 'subscriptionsReminder' as const;
    case 'inactivity':
      return 'reminderInactivity' as const;
    case 'shift_evening_before':
      return 'reminderShiftEveningBefore' as const;
    case 'shift_unclosed':
      return 'reminderShiftUnclosed' as const;
    case 'fx_change':
      return 'reminderFxChange' as const;
    default:
      return 'dailyReminder' as const;
  }
};

const showsNumericParam = (kind: ReminderKind) =>
  kind === 'subscriptions' || kind === 'inactivity' || kind === 'shift_evening_before' || kind === 'fx_change';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { t, language, setLanguage, displayCurrency, setDisplayCurrency, fxRates, fxStatus, refreshFxRates } = useTranslation();
  const { isSupported: fsSupported, isFullscreen, toggle: toggleFullscreen } =
    useTelegramFullscreen();

  const tgWindow = window as Window & TelegramWindow;
  const tg = tgWindow.Telegram?.WebApp;
  const openedFromTelegram = !!(tg?.initData || tg?.initDataUnsafe?.user?.id);
  const [reports, setReports] = useState<ReportSettings>({ autoWeekly: true, autoMonthly: true, reportCurrency: 'UAH', sendTime: '21:00' });
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loadingAutomation, setLoadingAutomation] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [rs, rm] = await Promise.all([getReportSettings(), getReminders()]);
        if (cancelled) return;
        setReports(rs);
        setReminders(rm);
      } catch {
        // ignore temporary network issues
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setReportPatch = useCallback(async (patch: Partial<typeof reports>) => {
    setLoadingAutomation(true);
    try {
      const next = await updateReportSettings(patch);
      setReports(next);
    } finally {
      setLoadingAutomation(false);
    }
  }, []);

  useEffect(() => {
    if (reports.reportCurrency === displayCurrency) return;
    void setReportPatch({ reportCurrency: displayCurrency });
  }, [displayCurrency, reports.reportCurrency, setReportPatch]);

  const patchReminder = async (id: string, patch: Partial<Reminder>) => {
    setLoadingAutomation(true);
    try {
      const next = await updateReminder(id, patch);
      setReminders((prev) => prev.map((r) => (r.id === id ? next : r)));
    } finally {
      setLoadingAutomation(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{t('settings', 'title')}</h1>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>{t('settings', 'display')}</div>
        <div className={styles.card}>
          <button
            type="button"
            className={styles.row}
            onClick={toggleFullscreen}
            disabled={!fsSupported}
            aria-pressed={isFullscreen}
          >
            <div className={styles.rowLeft}>
              <span className={styles.rowLabel}>
                {t('settings', 'fullscreen')}
              </span>
            </div>
            <span
              className={`${styles.switch} ${isFullscreen ? styles.switchOn : ''} ${
                !fsSupported ? styles.switchDisabled : ''
              }`}
              aria-hidden
            >
              <span className={styles.switchThumb} />
            </span>
          </button>
        </div>
        <p className={styles.sectionDescription}>
          {fsSupported
            ? t('settings', 'fullscreenDescription')
            : t('settings', 'fullscreenUnsupported')}
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>{t('settings', 'language')}</div>
        <div className={styles.card}>
          {LANGUAGES.map((lng: Language) => (
            <button
              key={lng}
              type="button"
              className={styles.row}
              onClick={() => setLanguage(lng)}
            >
              <div className={styles.rowLeft}>
                <span className={styles.flag} aria-hidden>
                  {LANGUAGE_FLAGS[lng]}
                </span>
                <span className={styles.rowLabel}>{LANGUAGE_LABELS[lng]}</span>
              </div>
              {language === lng && <span className={styles.check}>✓</span>}
            </button>
          ))}
        </div>
        <p className={styles.sectionDescription}>
          {t('settings', 'languageDescription')}
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>{t('settings', 'currency')}</div>
        <div className={styles.card}>
          {DISPLAY_CURRENCIES.map((currency) => {
            const labelKey: 'currencyUah' | 'currencyPln' | 'currencyUsd' =
              currency === 'USD'
                ? 'currencyUsd'
                : currency === 'PLN'
                  ? 'currencyPln'
                  : 'currencyUah';
            return (
              <button
                key={currency}
                type="button"
                className={styles.row}
                onClick={() => setDisplayCurrency(currency)}
              >
                <div className={styles.rowLeft}>
                  <span className={styles.rowLabel}>{t('settings', labelKey)}</span>
                </div>
                {displayCurrency === currency && <span className={styles.check}>✓</span>}
              </button>
            );
          })}
        </div>
        <p className={styles.sectionDescription}>
          {t('settings', 'currencyDescription')}
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>{t('settings', 'fxRates')}</div>
        <div className={styles.card}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('settings', 'fxUpdatedAt')}</span>
            <span className={styles.rowValue}>{new Date(fxRates.updatedAt).toLocaleString()}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('settings', 'fxStatus')}</span>
            <span className={styles.rowValue}>
              {fxStatus === 'live' ? t('settings', 'fxLive') : fxStatus === 'cache' ? t('settings', 'fxCache') : t('settings', 'fxFallback')}
            </span>
          </div>
          <button type="button" className={styles.row} onClick={() => void refreshFxRates()}>
            <span className={styles.rowLabel}>{t('settings', 'fxRefresh')}</span>
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>{t('settings', 'automationTitle')}</div>
        <div className={styles.card}>
          <label className={styles.row}>
            <span className={styles.rowLabel}>{t('settings', 'weeklyAutoReport')}</span>
            <input
              type="checkbox"
              checked={reports.autoWeekly}
              disabled={loadingAutomation}
              onChange={(e) => void setReportPatch({ autoWeekly: e.target.checked })}
            />
          </label>
          <label className={styles.row}>
            <span className={styles.rowLabel}>{t('settings', 'monthlyAutoReport')}</span>
            <input
              type="checkbox"
              checked={reports.autoMonthly}
              disabled={loadingAutomation}
              onChange={(e) => void setReportPatch({ autoMonthly: e.target.checked })}
            />
          </label>
          <label className={styles.row}>
            <span className={styles.rowLabel}>{t('settings', 'reportSendTime')}</span>
            <input
              className={styles.timeInput}
              type="time"
              value={reports.sendTime}
              disabled={loadingAutomation}
              onChange={(e) => void setReportPatch({ sendTime: e.target.value })}
            />
          </label>
          <button type="button" className={styles.row} disabled={loadingAutomation} onClick={() => void sendWeeklyReportNow()}>
            <span className={styles.rowLabel}>{t('settings', 'sendWeeklyNow')}</span>
          </button>
          <button type="button" className={styles.row} disabled={loadingAutomation} onClick={() => void sendMonthlyReportNow()}>
            <span className={styles.rowLabel}>{t('settings', 'sendMonthlyNow')}</span>
          </button>
          <button type="button" className={styles.row} onClick={() => navigate('/budgets')}>
            <span className={styles.rowLabel}>{t('settings', 'budgetsLink')}</span>
            <span className={styles.rowValue}>→</span>
          </button>
          {reminders.map((reminder) => (
            <div key={reminder.id} className={styles.reminderCard}>
              <div className={styles.reminderHeader}>
                <span className={styles.reminderTitle}>{t('settings', reminderTitleKey(reminder.kind))}</span>
                <label className={styles.reminderSwitch}>
                  <input
                    type="checkbox"
                    checked={reminder.enabled}
                    disabled={loadingAutomation}
                    onChange={(e) => void patchReminder(reminder.id, { enabled: e.target.checked })}
                  />
                </label>
              </div>
              <div className={styles.reminderRow}>
                <span className={styles.reminderMeta}>{t('settings', 'reminderTimeLabel')}</span>
                <input
                  className={styles.timeInput}
                  type="time"
                  value={reminder.timeHHMM}
                  disabled={loadingAutomation}
                  onChange={(e) => void patchReminder(reminder.id, { timeHHMM: e.target.value })}
                />
              </div>
              {showsNumericParam(reminder.kind) ? (
                <div className={styles.reminderRow}>
                  <span className={styles.reminderMeta}>
                    {reminder.kind === 'fx_change' ? t('settings', 'fxThresholdLabel') : t('settings', 'leadDaysLabel')}
                  </span>
                  <input
                    className={styles.reminderNumber}
                    type="number"
                    min={reminder.kind === 'fx_change' ? 1 : 0}
                    max={reminder.kind === 'fx_change' ? 100 : reminder.kind === 'inactivity' ? 90 : 31}
                    step={1}
                    value={reminder.leadDays}
                    disabled={loadingAutomation}
                    onChange={(e) =>
                      void patchReminder(reminder.id, { leadDays: Math.trunc(Number(e.target.value) || 0) })
                    }
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>{t('settings', 'about')}</div>
        <div className={styles.card}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('settings', 'version')}</span>
            <span className={styles.rowValue}>{APP_VERSION}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('settings', 'openedFrom')}</span>
            <span className={styles.rowValue}>
              {openedFromTelegram ? t('settings', 'telegram') : t('settings', 'browser')}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Settings;
