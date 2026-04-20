import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, List, PieChart, Settings as SettingsIcon } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import styles from './BottomNavigation.module.css';

const BottomNavigation: React.FC = () => {
  const { t } = useTranslation();

  const items = [
    { to: '/', icon: Home, label: t('nav', 'home'), end: true },
    { to: '/history', icon: List, label: t('nav', 'history') },
    { to: '/stats', icon: PieChart, label: t('nav', 'stats') },
    { to: '/settings', icon: SettingsIcon, label: t('nav', 'settings') },
  ];

  return (
    <nav className={styles.nav}>
      {items.map(({ to, icon: Icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => (isActive ? styles.active : styles.link)}
        >
          <Icon size={22} className={styles.icon} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default BottomNavigation;
