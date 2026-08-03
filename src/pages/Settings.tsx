import React from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import GeneralSettingsSection from '../components/settings/GeneralSettingsSection';
import ReportsSettingsSection from '../components/settings/ReportsSettingsSection';
import RemindersSettingsSection from '../components/settings/RemindersSettingsSection';
import PlannerTemplateSection from '../components/settings/PlannerTemplateSection';
import DangerZoneSection from '../components/settings/DangerZoneSection';
import styles from './Settings.module.css';

const Settings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{t('settings', 'title')}</h1>
      <GeneralSettingsSection />
      <ReportsSettingsSection />
      <RemindersSettingsSection />
      <PlannerTemplateSection />
      <DangerZoneSection />
    </div>
  );
};

export default Settings;
