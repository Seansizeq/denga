import React from 'react';
import { useGoBack } from '../hooks/useGoBack';
import { useTranslation } from '../i18n/LanguageContext';
import PlannerTemplateSection from '../components/settings/PlannerTemplateSection';
import PlannerAutomationSection from '../components/settings/PlannerAutomationSection';
import styles from './AutomationSettings.module.css';

/**
 * Посилання для ярликів, шаблон зміни за замовчуванням і ротація токена — усе
 * це потрібно раз на налаштування телефона, тож воно живе окремою сторінкою,
 * а не половиною головного екрана налаштувань.
 */
const AutomationSettings: React.FC = () => {
  const { t } = useTranslation();
  const goBack = useGoBack('/settings');

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={goBack}>
          ← {t('settings', 'title')}
        </button>
        <h1 className={styles.title}>{t('settings', 'automationTitle')}</h1>
      </header>
      <PlannerTemplateSection />
      <PlannerAutomationSection />
    </div>
  );
};

export default AutomationSettings;
