import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Wallet, BarChart2, Settings as SettingsIcon, Plus } from 'lucide-react';
import styles from './BottomNavigation.module.css';

const BottomNavigation: React.FC = () => {
  const navigate = useNavigate();

  return (
    <nav className={styles.nav}>
      <div className={styles.bar}>
        <NavLink
          to="/"
          end
          className={({ isActive }) => (isActive ? styles.active : styles.link)}
          aria-label="Home"
        >
          <Home size={24} strokeWidth={2} />
        </NavLink>

        <NavLink
          to="/history"
          className={({ isActive }) => (isActive ? styles.active : styles.link)}
          aria-label="History"
        >
          <Wallet size={24} strokeWidth={2} />
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
