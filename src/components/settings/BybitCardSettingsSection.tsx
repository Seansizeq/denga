import React, { useEffect, useState } from 'react';
import { CreditCard, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import {
  connectBybitCard,
  disconnectBybitCard,
  getBybitCardStatus,
  syncBybitCard,
  type BybitCardStatus,
} from '../../api/client';
import { useTranslation } from '../../i18n/LanguageContext';
import SettingsSection from './SettingsSection';
import styles from './BybitCardSettingsSection.module.css';

const emptyStatus: BybitCardStatus = {
  connected: false,
  enabled: false,
  importedCount: 0,
};

const BybitCardSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<BybitCardStatus>(emptyStatus);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  type ErrorFallback = 'bybitConnectError' | 'bybitSyncError' | 'bybitDisconnectError';
  const messageForCode = (code: string, fallback: ErrorFallback) => {
    switch (code) {
      case 'BYBIT_READ_ONLY_REQUIRED': return t('settings', 'bybitErrorReadOnly');
      case 'BYBIT_CARD_PERMISSION_REQUIRED': return t('settings', 'bybitErrorCardPermission');
      case 'BYBIT_MASTER_KEY_REQUIRED': return t('settings', 'bybitErrorMaster');
      case 'BYBIT_EU_THIRD_PARTY_REQUIRED': return t('settings', 'bybitErrorEu');
      case 'BYBIT_IP_MISMATCH': return t('settings', 'bybitErrorIp');
      case 'BYBIT_REGION_RESTRICTED': return t('settings', 'bybitErrorRegion');
      case 'BYBIT_PERMISSION_DENIED': return t('settings', 'bybitErrorPermission');
      case 'BYBIT_ENDPOINT_MISMATCH': return t('settings', 'bybitErrorEndpoint');
      case 'BYBIT_INVALID_CREDENTIALS': return t('settings', 'bybitErrorCredentials');
      case 'BYBIT_SERVER_NOT_CONFIGURED': return t('settings', 'bybitErrorServerConfig');
      case 'BYBIT_CARD_REQUEST_REJECTED': return t('settings', 'bybitErrorCardRequest');
      case 'BYBIT_REQUEST_FAILED': return t('settings', 'bybitErrorRetry');
      default: return t('settings', fallback);
    }
  };
  const messageForError = (cause: unknown, fallback: ErrorFallback) => {
    const code = cause instanceof Error && 'code' in cause
      ? String((cause as Error & { code?: string }).code ?? '')
      : '';
    return messageForCode(code, fallback);
  };

  useEffect(() => {
    let cancelled = false;
    void getBybitCardStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setError(t('settings', 'bybitLoadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!apiKey.trim() || !apiSecret.trim()) return;
    setBusy(true);
    setError('');
    try {
      const next = await connectBybitCard(apiKey.trim(), apiSecret.trim());
      setStatus(next);
      setApiKey('');
      setApiSecret('');
    } catch (cause) {
      setError(messageForError(cause, 'bybitConnectError'));
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    setError('');
    try {
      setStatus(await syncBybitCard());
    } catch (cause) {
      setError(messageForError(cause, 'bybitSyncError'));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t('settings', 'bybitDisconnectConfirm'))) return;
    setBusy(true);
    setError('');
    try {
      await disconnectBybitCard();
      setStatus(emptyStatus);
    } catch (cause) {
      setError(messageForError(cause, 'bybitDisconnectError'));
    } finally {
      setBusy(false);
    }
  };

  const lastSync = status.lastSyncAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(status.lastSyncAt),
      )
    : t('settings', 'bybitNeverSynced');
  const storedError = status.lastError
    ? messageForCode(status.lastErrorCode || 'BYBIT_REQUEST_FAILED', 'bybitSyncError')
    : '';

  return (
    <SettingsSection
      label={t('settings', 'sectionBybit')}
      description={t('settings', 'bybitDescription')}
    >
      <div className={styles.header}>
        <span className={styles.icon}><CreditCard size={22} aria-hidden="true" /></span>
        <div>
          <div className={styles.title}>Bybit</div>
          <div className={styles.subtitle}>
            {loading
              ? t('settings', 'bybitLoading')
              : status.connected
                ? t('settings', 'bybitConnected')
                : t('settings', 'bybitNotConnected')}
          </div>
        </div>
        {status.connected ? <span className={styles.liveDot} aria-hidden="true" /> : null}
      </div>

      {status.connected ? (
        <div className={styles.connectedBody}>
          <div className={styles.securityLine}>
            <ShieldCheck size={17} aria-hidden="true" />
            <span>{status.keyHint} · {t('settings', 'bybitReadOnly')}</span>
          </div>
          <div className={styles.stats}>
            <div>
              <span>{t('settings', 'bybitLastSync')}</span>
              <strong>{lastSync}</strong>
            </div>
            <div>
              <span>{t('settings', 'bybitImported')}</span>
              <strong>{status.importedCount}</strong>
            </div>
            <div>
              <span>{t('settings', 'bybitAssets')}</span>
              <strong>{status.syncedAssetCount ?? 0}</strong>
            </div>
          </div>
          {!error && storedError ? <p className={styles.warning}>{storedError}</p> : null}
          {status.balanceSyncError ? <p className={styles.warning}>{t('settings', 'bybitBalanceWarning')}</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.actions}>
            <button className={styles.primaryButton} type="button" onClick={handleSync} disabled={busy}>
              <RefreshCw size={17} className={busy ? styles.spinning : ''} aria-hidden="true" />
              {busy ? t('settings', 'bybitSyncing') : t('settings', 'bybitSyncNow')}
            </button>
            <button className={styles.disconnectButton} type="button" onClick={handleDisconnect} disabled={busy}>
              <Unplug size={17} aria-hidden="true" />
              {t('settings', 'bybitDisconnect')}
            </button>
          </div>
        </div>
      ) : (
        <form className={styles.form} onSubmit={handleConnect}>
          <label>
            <span>API Key</span>
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={t('settings', 'bybitApiKeyPlaceholder')}
              disabled={busy || loading}
            />
          </label>
          <label>
            <span>API Secret</span>
            <input
              type="password"
              value={apiSecret}
              onChange={(event) => setApiSecret(event.target.value)}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={t('settings', 'bybitApiSecretPlaceholder')}
              disabled={busy || loading}
            />
          </label>
          <p className={styles.hint}><ShieldCheck size={16} aria-hidden="true" />{t('settings', 'bybitSecurityHint')}</p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={busy || loading || !apiKey.trim() || !apiSecret.trim()}
          >
            {busy ? t('settings', 'bybitConnecting') : t('settings', 'bybitConnect')}
          </button>
        </form>
      )}
    </SettingsSection>
  );
};

export default BybitCardSettingsSection;
