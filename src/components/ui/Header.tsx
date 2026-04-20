import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import styles from './Header.module.css';

const Header: React.FC = () => {
  const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user;
  const firstName: string | undefined = tgUser?.first_name;
  const lastName: string | undefined = tgUser?.last_name;
  const userName: string | undefined = tgUser?.username;
  const photoUrl: string | undefined = tgUser?.photo_url;

  const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'Denga';
  const handle = userName ? `@${userName}` : '';
  const initials = (firstName?.[0] ?? 'D').toUpperCase();

  return (
    <header className={styles.header}>
      <Link to="/settings" className={styles.profileLink} aria-label="Profile & settings">
        <div className={styles.avatar}>
          {photoUrl ? (
            <img src={photoUrl} alt="" className={styles.avatarImg} />
          ) : (
            <span className={styles.avatarFallback}>{initials}</span>
          )}
        </div>

        <div className={styles.nameBlock}>
          {handle && <span className={styles.handle}>{handle}</span>}
          <span className={styles.name}>
            {displayName}
            <ChevronDown size={16} className={styles.chevron} />
          </span>
        </div>
      </Link>
    </header>
  );
};

export default Header;
