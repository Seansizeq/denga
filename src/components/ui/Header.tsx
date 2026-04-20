import React from 'react';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import styles from './Header.module.css';

interface HeaderProps {
  userName?: string;
}

const Header: React.FC<HeaderProps> = ({ userName }) => {
  const { t } = useTranslation();

  const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user;
  const displayName = userName || tgUser?.first_name || '';

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.logo} aria-hidden>
          <span>₴</span>
        </div>
        <div className={styles.titleBlock}>
          <span className={styles.greeting}>{t('dashboard', 'greeting')}</span>
          <span className={styles.name}>
            {displayName ? `${displayName} 👋` : 'Denga'}
          </span>
        </div>
      </div>

      <Link to="/settings" className={styles.iconButton} aria-label="Settings">
        <SettingsIcon size={22} />
      </Link>
    </header>
  );
};

export default Header;
