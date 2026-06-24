import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Plus, WalletCards, Settings as SettingsIcon, PieChart } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import styles from './BottomNavigation.module.css';

const BottomNavigation: React.FC = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const pathname = location.pathname;

  const indicatorColumn =
    pathname === '/'
      ? 1
      : pathname.startsWith('/add')
        ? 2
        : pathname.startsWith('/accounts')
          ? 3
          : pathname.startsWith('/stats')
            ? 4
            : pathname.startsWith('/settings')
              ? 5
              : null;

  return (
    <nav className={styles.nav}>
      <div className={styles.bar}>
        {indicatorColumn ? (
          <span
            className={styles.activeIndicator}
            style={{ ['--indicator-col' as string]: indicatorColumn }}
            aria-hidden="true"
          />
        ) : null}
        <NavLink
          to="/"
          end
          className={({ isActive }) => (isActive ? styles.active : styles.link)}
          aria-label={t('nav', 'home')}
        >
          <Home size={24} strokeWidth={2} />
        </NavLink>

        <NavLink
          to="/add"
          className={({ isActive }) =>
            `${isActive ? styles.active : styles.link} ${styles.roundBtn}`
          }
          aria-label={t('nav', 'add')}
        >
          <Plus size={26} strokeWidth={2.4} />
        </NavLink>

        <NavLink
          to="/accounts"
          className={({ isActive }) => (isActive ? styles.active : styles.link)}
          aria-label={t('balance', 'moneySources')}
        >
          <WalletCards size={24} strokeWidth={2} />
        </NavLink>

        <NavLink
          to="/stats"
          className={({ isActive }) => (isActive ? styles.active : styles.link)}
          aria-label={t('nav', 'stats')}
        >
          <PieChart size={24} strokeWidth={2} />
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) => (isActive ? styles.active : styles.link)}
          aria-label={t('settings', 'title')}
        >
          <SettingsIcon size={24} strokeWidth={2} />
        </NavLink>
      </div>
    </nav>
  );
};

export default BottomNavigation;
