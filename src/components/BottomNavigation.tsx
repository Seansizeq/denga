import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, List, Plus, PieChart, Settings } from 'lucide-react';
import styles from './BottomNavigation.module.css';

const BottomNavigation: React.FC = () => {
  return (
    <nav className={styles.nav}>
      <NavLink to="/" className={({ isActive }) => isActive ? styles.active : styles.link}>
        <Home size={24} />
        <span>Головна</span>
      </NavLink>
      <NavLink to="/history" className={({ isActive }) => isActive ? styles.active : styles.link}>
        <List size={24} />
        <span>Історія</span>
      </NavLink>
      <NavLink to="/add" className={styles.plusLink}>
        <div className={styles.plusIcon}>
          <Plus size={32} color="white" />
        </div>
      </NavLink>
      <NavLink to="/stats" className={({ isActive }) => isActive ? styles.active : styles.link}>
        <PieChart size={24} />
        <span>Статистика</span>
      </NavLink>
      <NavLink to="/settings" className={({ isActive }) => isActive ? styles.active : styles.link}>
        <Settings size={24} />
        <span>Налаштування</span>
      </NavLink>
    </nav>
  );
};

export default BottomNavigation;
