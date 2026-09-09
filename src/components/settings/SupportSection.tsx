import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from '../../i18n/LanguageContext';
import FeedbackSheet from '../feedback/FeedbackSheet';
import SettingsSection from './SettingsSection';
import SettingsRow from './SettingsRow';

/**
 * Єдиний спосіб для людини сказати, що щось зламалося.
 *
 * Стоїть у налаштуваннях, а не десь на видноті: скаргу пишуть рідко, але
 * шукають її саме тут — поруч із рештою «про застосунок».
 */
const SupportSection: React.FC = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <SettingsSection label={t('feedback', 'section')}>
        <SettingsRow
          label={t('feedback', 'row')}
          sublabel={t('feedback', 'rowDescription')}
          chevron
          onClick={() => setOpen(true)}
        />
      </SettingsSection>

      {open ? <FeedbackSheet screen={pathname} onClose={() => setOpen(false)} /> : null}
    </>
  );
};

export default SupportSection;
