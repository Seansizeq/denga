import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { useTranslation } from '../../i18n/LanguageContext';
import SettingsSection from './SettingsSection';
import styles from './DangerZoneSection.module.css';

/**
 * Усе, що додаток кешує локально. Після видалення акаунта на пристрої не має
 * лишитися жодної суми — включно з кешем курсів і крипто-історії.
 */
const LOCAL_STORAGE_KEYS = [
  'denga_transactions_v1',
  'denga_accounts_v1',
  'denga_crypto_prices_v1',
  'denga_crypto_history_v2',
  'denga_subscriptions_v1',
  'denga_fx_rates_v1',
  'category_overrides_v1',
  'denga_dev',
];

const DangerZoneSection: React.FC = () => {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await apiFetch('/api/me', { method: 'DELETE' });
      if (!res.ok) throw new Error('failed');
      for (const key of LOCAL_STORAGE_KEYS) {
        localStorage.removeItem(key);
      }
      window.location.reload();
    } catch {
      setError(t('settings', 'deleteAccountFailed'));
      setDeleting(false);
    }
  };

  return (
    <SettingsSection label={t('settings', 'dangerZone')}>
      {!confirming ? (
        <button
          type="button"
          className={styles.deleteRow}
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={18} strokeWidth={2} className={styles.icon} aria-hidden="true" />
          <span className={styles.deleteLabel}>{t('settings', 'deleteAccount')}</span>
        </button>
      ) : (
        <div className={styles.confirmBox}>
          <p className={styles.warning}>{t('settings', 'deleteAccountWarning')}</p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => { setConfirming(false); setError(''); }}
              disabled={deleting}
            >
              {t('addTx', 'cancel')}
            </button>
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? t('settings', 'deleteAccountProgress') : t('settings', 'deleteAccountConfirm')}
            </button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
};

export default DangerZoneSection;
