import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, CalendarDays, WalletCards, Settings as SettingsIcon, PieChart } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { useReorderableNav, type NavKey } from '../hooks/useReorderableNav';
import styles from './BottomNavigation.module.css';

interface NavItem {
  to: string;
  end?: boolean;
  Icon: typeof Home;
  /** Кругла кнопка — історична форма саме календаря, їде разом із ним. */
  round?: boolean;
  matches: (pathname: string) => boolean;
}

const ITEMS: Record<NavKey, NavItem> = {
  home: { to: '/', end: true, Icon: Home, matches: (p) => p === '/' },
  calendar: {
    to: '/calendar',
    Icon: CalendarDays,
    round: true,
    matches: (p) => p.startsWith('/calendar'),
  },
  accounts: { to: '/accounts', Icon: WalletCards, matches: (p) => p.startsWith('/accounts') },
  stats: { to: '/stats', Icon: PieChart, matches: (p) => p.startsWith('/stats') },
  settings: { to: '/settings', Icon: SettingsIcon, matches: (p) => p.startsWith('/settings') },
};

const BottomNavigation: React.FC = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const {
    order,
    barRef,
    draggingKey,
    settling,
    setItemRef,
    onPointerDown,
    itemHandlers,
    onClickCapture,
    visualIndex,
    shiftStyle,
  } = useReorderableNav();

  const pathname = location.pathname;
  const label: Record<NavKey, string> = {
    home: t('nav', 'home'),
    calendar: t('nav', 'calendar'),
    accounts: t('balance', 'moneySources'),
    stats: t('nav', 'stats'),
    settings: t('settings', 'title'),
  };

  const activeKey = order.find((key) => ITEMS[key].matches(pathname)) ?? null;
  // Підкладка їде за активною вкладкою і під час перестановки — тобто рахуємо
  // не місце в масиві, а те, де іконка зараз видно.
  const indicatorColumn = activeKey ? visualIndex(activeKey) + 1 : null;

  return (
    <nav className={styles.nav}>
      <div
        className={styles.bar}
        ref={barRef}
        onClickCapture={onClickCapture}
        data-settling={settling ? 'true' : undefined}
      >
        {indicatorColumn ? (
          <span
            className={styles.activeIndicator}
            style={{ ['--indicator-col' as string]: indicatorColumn }}
            aria-hidden="true"
          />
        ) : null}
        {order.map((key) => {
          const item = ITEMS[key];
          const { Icon } = item;
          const isActive = activeKey === key;
          return (
            <NavLink
              key={key}
              to={item.to}
              end={item.end}
              ref={setItemRef(key)}
              className={`${isActive ? styles.active : styles.link}${
                item.round ? ` ${styles.roundBtn}` : ''
              }`}
              style={shiftStyle(key)}
              data-dragging={draggingKey === key ? 'true' : undefined}
              onPointerDown={onPointerDown(key)}
              {...itemHandlers}
              aria-label={label[key]}
            >
              <Icon size={24} strokeWidth={2} />
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavigation;
