import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Target } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import { hapticLight } from '../../utils/notify';
import SettingsSection from './SettingsSection';
import SettingsRow from './SettingsRow';

const FinanceLinksSection: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const go = (path: string) => {
    hapticLight();
    navigate(path);
  };

  return (
    <SettingsSection label={t('settings', 'sectionFinance')} description={t('settings', 'financeDescription')}>
      <SettingsRow
        label={t('settings', 'budgetsLink')}
        leading={<Wallet size={22} strokeWidth={1.8} />}
        chevron
        onClick={() => go('/budgets')}
      />
      <SettingsRow
        label={t('settings', 'goalsLink')}
        leading={<Target size={22} strokeWidth={1.8} />}
        chevron
        onClick={() => go('/goals')}
      />
    </SettingsSection>
  );
};

export default FinanceLinksSection;
