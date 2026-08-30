import React from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import GeneralSettingsSection from '../components/settings/GeneralSettingsSection';
import NotificationsSection from '../components/settings/NotificationsSection';
import MoreSettingsSection from '../components/settings/MoreSettingsSection';
import DangerZoneSection from '../components/settings/DangerZoneSection';
import styles from './Settings.module.css';

const Settings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{t('settings', 'title')}</h1>
      <GeneralSettingsSection />
      <NotificationsSection />
      <MoreSettingsSection />
      <DangerZoneSection />
    </div>
  );
};

export default Settings;
