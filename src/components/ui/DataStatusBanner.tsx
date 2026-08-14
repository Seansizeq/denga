import React, { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import { usePortfolio } from '../../context/PortfolioContext';
import { useTransactions } from '../../context/TransactionContext';
import styles from './DataStatusBanner.module.css';

/**
 * Кеш на екрані — нормально; кеш, який видає себе за живі дані — ні.
 * Смужка з'являється тільки коли є що сказати: немає мережі, сервер не
 * відповідає, або курс валют узятий із запасного списку.
 */
const DataStatusBanner: React.FC = () => {
  const { t, fxStatus, refreshFxRates } = useTranslation();
  const { accountsStale, refreshAccounts } = usePortfolio();
  const { transactionsStale, refreshTransactions } = useTransactions();
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const dataStale = accountsStale || transactionsStale;
  const message = !online
    ? t('balance', 'dataOffline')
    : dataStale
      ? t('balance', 'dataStale')
      : fxStatus === 'fallback'
        ? t('balance', 'fxFallback')
        : null;

  if (!message) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await Promise.all([refreshAccounts(), refreshTransactions(), refreshFxRates()]);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <CloudOff size={14} strokeWidth={2} aria-hidden="true" />
      <span className={styles.text}>{message}</span>
      <button type="button" className={styles.retry} onClick={() => void handleRetry()} disabled={retrying}>
        <RefreshCw size={13} strokeWidth={2.2} className={retrying ? styles.spinning : undefined} aria-hidden="true" />
        {t('common', 'retry')}
      </button>
    </div>
  );
};

export default DataStatusBanner;
