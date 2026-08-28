import React, { useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, CalendarDays, WalletCards, Settings as SettingsIcon, PieChart } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { useGlassSlider } from '../hooks/useGlassSlider';
import styles from './BottomNavigation.module.css';

interface NavItem {
  to: string;
  end?: boolean;
  Icon: typeof Home;
  /** Кругла кнопка — історична форма календаря. */
  round?: boolean;
  matches: (pathname: string) => boolean;
}

const ITEMS: NavItem[] = [
  { to: '/', end: true, Icon: Home, matches: (p) => p === '/' },
  { to: '/calendar', Icon: CalendarDays, round: true, matches: (p) => p.startsWith('/calendar') },
  { to: '/accounts', Icon: WalletCards, matches: (p) => p.startsWith('/accounts') },
  { to: '/stats', Icon: PieChart, matches: (p) => p.startsWith('/stats') },
  { to: '/settings', Icon: SettingsIcon, matches: (p) => p.startsWith('/settings') },
];

const BottomNavigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const pathname = location.pathname;

  const labels = [
    t('nav', 'home'),
    t('nav', 'calendar'),
    t('balance', 'moneySources'),
    t('nav', 'stats'),
    t('settings', 'title'),
  ];

  const activeIndex = ITEMS.findIndex((item) => item.matches(pathname));
  const indicatorColumn = activeIndex >= 0 ? activeIndex + 1 : null;

  const handlePick = useCallback(
    (index: number) => {
      const target = ITEMS[index];
      if (target && target.to !== pathname) navigate(target.to);
    },
    [navigate, pathname],
  );

  const { barRef, glassRef, hoverIndex, isSliding, handlers, onClickCapture } = useGlassSlider({
    count: ITEMS.length,
    column: indicatorColumn,
    onPick: handlePick,
  });

  return (
    <nav className={styles.nav}>
      <div className={styles.bar} ref={barRef} onClickCapture={onClickCapture}>
        {indicatorColumn ? (
          <span
            className={styles.activeIndicator}
            ref={glassRef}
            style={{ ['--indicator-col' as string]: indicatorColumn }}
            data-sliding={isSliding ? 'true' : undefined}
            aria-hidden="true"
          />
        ) : null}
        {ITEMS.map((item, index) => {
          const { Icon } = item;
          const isActive = activeIndex === index;
          // Доки скло їде, підсвіченою має бути іконка під ним, а не та,
          // з якої почали: інакше не видно, куди саме ти його везеш.
          const isLit = isSliding ? hoverIndex === index : isActive;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={`${isLit ? styles.active : styles.link}${
                item.round ? ` ${styles.roundBtn}` : ''
              }`}
              aria-label={labels[index]}
              {...(isActive ? handlers : null)}
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
