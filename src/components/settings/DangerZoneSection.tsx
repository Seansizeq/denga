import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { apiFetch } from '../../api/client';
import SettingsSection from './SettingsSection';
import styles from './DangerZoneSection.module.css';

const LOCAL_STORAGE_KEYS = [
  'denga_transactions_v1',
  'denga_accounts_v1',
  'denga_crypto_prices_v1',
  'denga_crypto_history_v1',
  'denga_dev',
];

const DangerZoneSection: React.FC = () => {
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
      setError('Не вдалося видалити. Спробуй ще раз.');
      setDeleting(false);
    }
  };

  return (
    <SettingsSection label="Небезпечна зона">
      {!confirming ? (
        <button
          type="button"
          className={styles.deleteRow}
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={18} strokeWidth={2} className={styles.icon} aria-hidden="true" />
          <span className={styles.deleteLabel}>Видалити акаунт</span>
        </button>
      ) : (
        <div className={styles.confirmBox}>
          <p className={styles.warning}>
            Всі транзакції, рахунки, цілі та налаштування будуть видалені назавжди. Це незворотна дія.
          </p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => { setConfirming(false); setError(''); }}
              disabled={deleting}
            >
              Скасувати
            </button>
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? 'Видалення...' : 'Так, видалити все'}
            </button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
};

export default DangerZoneSection;
