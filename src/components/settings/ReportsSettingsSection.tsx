import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import {
  getReportSettings,
  updateReportSettings,
  type ReportSettings,
} from '../../api/client';
import Switch from '../ui/Switch';
import SettingsSection from './SettingsSection';
import SettingsRow from './SettingsRow';
import { useSaveSetting } from './useSaveSetting';
import styles from './ReportsSettingsSection.module.css';

const ReportsSettingsSection: React.FC = () => {
  const { t, displayCurrency } = useTranslation();
  const { saving, run } = useSaveSetting();
  const [reports, setReports] = useState<ReportSettings>({
    autoWeekly: true,
    autoMonthly: true,
    reportCurrency: 'UAH',
    sendTime: '21:00',
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rs = await getReportSettings();
        if (!cancelled) setReports(rs);
      } catch {
        // ignore temporary network issues
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reports.reportCurrency === displayCurrency) return;
    void run(
      () => updateReportSettings({ reportCurrency: displayCurrency }),
      (next) => setReports(next),
      { silent: true },
    );
  }, [displayCurrency, reports.reportCurrency, run]);

  const patch = (next: Partial<ReportSettings>) =>
    void run(() => updateReportSettings(next), (value) => setReports(value));

  // Local input state so the time field saves on blur, not on every keystroke.
  const [sendTimeInput, setSendTimeInput] = useState(reports.sendTime);
  useEffect(() => {
    setSendTimeInput(reports.sendTime);
  }, [reports.sendTime]);
  const commitSendTime = () => {
    if (sendTimeInput && sendTimeInput !== reports.sendTime) patch({ sendTime: sendTimeInput });
  };

  return (
    <SettingsSection label={t('settings', 'sectionReports')}>
      <SettingsRow
        label={t('settings', 'weeklyAutoReport')}
        trailing={
          <Switch
            checked={reports.autoWeekly}
            disabled={saving}
            onChange={(v) => patch({ autoWeekly: v })}
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
            onChange={(v) => patch({ autoMonthly: v })}
            aria-label={t('settings', 'monthlyAutoReport')}
          />
        }
      />
      <SettingsRow
        label={t('settings', 'reportSendTime')}
        trailing={
          <input
            className={styles.timeInput}
            type="time"
            value={sendTimeInput}
            onChange={(e) => setSendTimeInput(e.target.value)}
            onBlur={commitSendTime}
          />
        }
      />
    </SettingsSection>
  );
};

export default ReportsSettingsSection;
