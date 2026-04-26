import React from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import { LANGUAGES, LANGUAGE_LABELS, LANGUAGE_FLAGS } from '../i18n/translations';
import type { Language } from '../i18n/translations';
import type { DisplayCurrency } from '../utils/formatters';
import { useTelegramFullscreen } from '../hooks/useTelegramFullscreen';
import type { TelegramWindow } from '../types/telegram';
import styles from './Settings.module.css';

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev';
const DISPLAY_CURRENCIES: DisplayCurrency[] = ['UAH', 'PLN', 'USD'];

const Settings: React.FC = () => {
  const { t, language, setLanguage, displayCurrency, setDisplayCurrency, fxRates, fxStatus, refreshFxRates } = useTranslation();
  const { isSupported: fsSupported, isFullscreen, toggle: toggleFullscreen } =
    useTelegramFullscreen();

  const tgWindow = window as Window & TelegramWindow;
  const tg = tgWindow.Telegram?.WebApp;
  const openedFromTelegram = !!(tg?.initData || tg?.initDataUnsafe?.user?.id);

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{t('settings', 'title')}</h1>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>{t('settings', 'display')}</div>
        <div className={styles.card}>
          <button
            type="button"
            className={styles.row}
            onClick={toggleFullscreen}
            disabled={!fsSupported}
            aria-pressed={isFullscreen}
          >
            <div className={styles.rowLeft}>
              <span className={styles.rowLabel}>
                {t('settings', 'fullscreen')}
              </span>
            </div>
            <span
              className={`${styles.switch} ${isFullscreen ? styles.switchOn : ''} ${
                !fsSupported ? styles.switchDisabled : ''
              }`}
              aria-hidden
            >
              <span className={styles.switchThumb} />
            </span>
          </button>
        </div>
        <p className={styles.sectionDescription}>
          {fsSupported
            ? t('settings', 'fullscreenDescription')
            : t('settings', 'fullscreenUnsupported')}
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>{t('settings', 'language')}</div>
        <div className={styles.card}>
          {LANGUAGES.map((lng: Language) => (
            <button
              key={lng}
              type="button"
              className={styles.row}
              onClick={() => setLanguage(lng)}
            >
              <div className={styles.rowLeft}>
                <span className={styles.flag} aria-hidden>
                  {LANGUAGE_FLAGS[lng]}
                </span>
                <span className={styles.rowLabel}>{LANGUAGE_LABELS[lng]}</span>
              </div>
              {language === lng && <span className={styles.check}>✓</span>}
            </button>
          ))}
        </div>
        <p className={styles.sectionDescription}>
          {t('settings', 'languageDescription')}
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>{t('settings', 'currency')}</div>
        <div className={styles.card}>
          {DISPLAY_CURRENCIES.map((currency) => {
            const labelKey: 'currencyUah' | 'currencyPln' | 'currencyUsd' =
              currency === 'USD'
                ? 'currencyUsd'
                : currency === 'PLN'
                  ? 'currencyPln'
                  : 'currencyUah';
            return (
              <button
                key={currency}
                type="button"
                className={styles.row}
                onClick={() => setDisplayCurrency(currency)}
              >
                <div className={styles.rowLeft}>
                  <span className={styles.rowLabel}>{t('settings', labelKey)}</span>
                </div>
                {displayCurrency === currency && <span className={styles.check}>✓</span>}
              </button>
            );
          })}
        </div>
        <p className={styles.sectionDescription}>
          {t('settings', 'currencyDescription')}
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>{t('settings', 'fxRates')}</div>
        <div className={styles.card}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('settings', 'fxUpdatedAt')}</span>
            <span className={styles.rowValue}>{new Date(fxRates.updatedAt).toLocaleString()}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('settings', 'fxStatus')}</span>
            <span className={styles.rowValue}>
              {fxStatus === 'live' ? t('settings', 'fxLive') : fxStatus === 'cache' ? t('settings', 'fxCache') : t('settings', 'fxFallback')}
            </span>
          </div>
          <button type="button" className={styles.row} onClick={() => void refreshFxRates()}>
            <span className={styles.rowLabel}>{t('settings', 'fxRefresh')}</span>
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>{t('settings', 'about')}</div>
        <div className={styles.card}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('settings', 'version')}</span>
            <span className={styles.rowValue}>{APP_VERSION}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('settings', 'openedFrom')}</span>
            <span className={styles.rowValue}>
              {openedFromTelegram ? t('settings', 'telegram') : t('settings', 'browser')}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Settings;
