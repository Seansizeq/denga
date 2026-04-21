import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, CalendarDays, BarChart2, Settings as SettingsIcon, Plus } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import styles from './BottomNavigation.module.css';

const BottomNavigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const pathname = location.pathname;

  const indicatorColumn =
    pathname === '/'
      ? 1
      : pathname.startsWith('/calendar')
        ? 2
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
          aria-label="Home"
        >
          <Home size={24} strokeWidth={2} />
        </NavLink>

        <NavLink
          to="/calendar"
          className={({ isActive }) =>
            `${isActive ? styles.active : styles.link} ${styles.roundBtn}`
          }
          aria-label={t('nav', 'calendar')}
        >
          <CalendarDays size={24} strokeWidth={2} />
        </NavLink>

        <button
          type="button"
          className={styles.fab}
          onClick={() => navigate('/add')}
          aria-label="Add transaction"
        >
          <Plus size={28} strokeWidth={2.4} />
        </button>

        <NavLink
          to="/stats"
          className={({ isActive }) => (isActive ? styles.active : styles.link)}
          aria-label="Stats"
        >
          <BarChart2 size={24} strokeWidth={2} />
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) => (isActive ? styles.active : styles.link)}
          aria-label="Settings"
        >
          <SettingsIcon size={24} strokeWidth={2} />
        </NavLink>
      </div>
    </nav>
  );
};

export default BottomNavigation;
