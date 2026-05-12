import React, { useEffect, useRef, useState } from 'react';
import styles from './SplashScreen.module.css';

interface SplashScreenProps {
  isReady: boolean;
  onHidden?: () => void;
  exitDelayMs?: number;
}

const HIDE_DURATION_MS = 450;

const SplashScreen: React.FC<SplashScreenProps> = ({
  isReady,
  onHidden,
  exitDelayMs = 120,
}) => {
  const [hiding, setHiding] = useState(false);
  const hideTriggeredRef = useRef(false);

  useEffect(() => {
    if (!isReady || hideTriggeredRef.current) return;
    hideTriggeredRef.current = true;

    const timer = window.setTimeout(() => {
      setHiding(true);
    }, exitDelayMs);

    const removeTimer = window.setTimeout(() => {
      onHidden?.();
    }, exitDelayMs + HIDE_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(removeTimer);
    };
  }, [exitDelayMs, isReady, onHidden]);

  return (
    <div className={`${styles.splash} ${hiding ? styles.hide : ''}`}>
      <div className={styles.logoWrap}>
        <div className={styles.logoIcon}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="url(#grad)" opacity="0.15" />
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.93V18h-2v-1.07C9.07 16.6 7.75 15.44 7.25 14h2.12c.41.87 1.29 1.5 2.63 1.5 1.67 0 2.5-.83 2.5-2 0-1.04-.62-1.73-2.38-2.18l-1.08-.27C8.96 10.6 8 9.46 8 8c0-1.77 1.23-3.12 3-3.48V3.5h2v1.07c1.65.35 2.87 1.4 3.37 2.93h-2.12c-.34-.69-1.07-1.25-2.25-1.25-1.38 0-2 .71-2 1.75 0 .97.55 1.53 2.18 1.96l1.08.27C15.09 10.72 16 11.88 16 13.5c0 1.93-1.25 3.2-3 3.43z"
              fill="url(#grad)"
            />
            <defs>
              <linearGradient id="grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="#9b7cff" />
                <stop offset="1" stopColor="#7c5cff" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <span className={styles.logoText}>Denga</span>
      </div>
      <div className={styles.dotsRow}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
};

export default SplashScreen;
