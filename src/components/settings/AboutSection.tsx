import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import type { TelegramWindow } from '../../types/telegram';
import SettingsSection from './SettingsSection';
import SettingsRow from './SettingsRow';

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev';

const AboutSection: React.FC = () => {
  const { t } = useTranslation();
  const tg = (window as Window & TelegramWindow).Telegram?.WebApp;
  const openedFromTelegram = !!(tg?.initData || tg?.initDataUnsafe?.user?.id);

  return (
    <SettingsSection label={t('settings', 'about')}>
      <SettingsRow label={t('settings', 'version')} value={APP_VERSION} />
      <SettingsRow
        label={t('settings', 'openedFrom')}
        value={openedFromTelegram ? t('settings', 'telegram') : t('settings', 'browser')}
      />
    </SettingsSection>
  );
};

export default AboutSection;
