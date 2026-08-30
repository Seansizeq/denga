import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n/LanguageContext';
import { useTelegramFullscreen } from '../../hooks/useTelegramFullscreen';
import Switch from '../ui/Switch';
import SettingsSection from './SettingsSection';
import SettingsRow from './SettingsRow';

/**
 * Рідковживане, але потрібне: повноекранний режим вмикають раз і забувають,
 * а автоматизація — це п'ять посилань і чотири абзаци інструкцій, які раніше
 * займали пів екрана налаштувань. Тепер вона за одним рядком.
 */
const MoreSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isSupported: fsSupported, isFullscreen, toggle: toggleFullscreen } = useTelegramFullscreen();

  return (
    <SettingsSection label={t('settings', 'sectionMore')}>
      <SettingsRow
        label={t('settings', 'automationRow')}
        sublabel={t('settings', 'automationRowDescription')}
        chevron
        onClick={() => navigate('/settings/automation')}
      />
      <SettingsRow
        label={t('settings', 'fullscreen')}
        sublabel={fsSupported ? undefined : t('settings', 'fullscreenUnsupported')}
        trailing={
          <Switch
            checked={isFullscreen}
            onChange={() => toggleFullscreen()}
            disabled={!fsSupported}
            aria-label={t('settings', 'fullscreen')}
          />
        }
      />
    </SettingsSection>
  );
};

export default MoreSettingsSection;
