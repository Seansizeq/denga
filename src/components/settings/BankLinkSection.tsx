import React, { useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import {
  apiFetch,
  fetchMonobankAccounts,
  getBankLinks,
  linkMonobankAccount,
  unlinkMonobankAccount,
  type BankLink,
  type MonobankAccountOption,
} from '../../api/client';
import { useToast } from '../ui/Toast';
import { hapticLight } from '../../utils/notify';
import SettingsSection from './SettingsSection';
import styles from './BankLinkSection.module.css';

type WalletAccount = {
  accountKey: string;
  name: string;
  primaryCurrency: string;
};

/**
 * Підключення картки банку.
 *
 * Два кроки, а не один, і це не зайвий клік: `client-info` у monobank
 * обмежений одним запитом на хвилину, тож токен має бути перевірений і список
 * карток показаний **до** того, як людина обере рахунок. Інакше кожна помилка
 * у виборі коштувала б хвилини очікування.
 */
const BankLinkSection: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const [links, setLinks] = useState<BankLink[]>([]);
  const [walletAccounts, setWalletAccounts] = useState<WalletAccount[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [token, setToken] = useState('');
  const [bankAccounts, setBankAccounts] = useState<MonobankAccountOption[] | null>(null);
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>('');
  const [selectedWalletKey, setSelectedWalletKey] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [linkRows, accountsRes] = await Promise.all([getBankLinks(), apiFetch('/api/accounts')]);
        if (cancelled) return;
        setLinks(linkRows);
        if (accountsRes.ok) setWalletAccounts(await accountsRes.json());
      } catch {
        // Тимчасова мережа: секція просто не покажеться, решта налаштувань жива.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chosenBankAccount = useMemo(
    () => bankAccounts?.find((row) => row.id === selectedBankAccount) ?? null,
    [bankAccounts, selectedBankAccount],
  );

  /**
   * Рахунки лише тієї ж валюти: гаманець веде баланс в одній одиниці, і
   * операція в іншій до нього просто не дійде. Показувати їх у списку означало
   * б дати обрати те, що сервер однаково відхилить.
   */
  const walletOptions = useMemo(() => {
    const currency = chosenBankAccount?.currency ?? null;
    const linked = new Set(links.map((row) => row.accountKey));
    return walletAccounts.filter(
      (account) =>
        (!currency || String(account.primaryCurrency).toUpperCase() === currency)
        && !linked.has(account.accountKey),
    );
  }, [walletAccounts, chosenBankAccount, links]);

  const resetForm = () => {
    setToken('');
    setBankAccounts(null);
    setSelectedBankAccount('');
    setSelectedWalletKey('');
  };

  const handleLoadAccounts = async () => {
    if (!token.trim() || busy) return;
    setBusy(true);
    try {
      const accounts = await fetchMonobankAccounts(token.trim());
      setBankAccounts(accounts);
      const firstSupported = accounts.find((row) => row.supported);
      setSelectedBankAccount(firstSupported?.id ?? '');
      hapticLight();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : t('settings', 'saveFailed'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    if (!chosenBankAccount || !selectedWalletKey || busy) return;
    setBusy(true);
    try {
      const next = await linkMonobankAccount({
        token: token.trim(),
        bankAccountId: chosenBankAccount.id,
        accountKey: selectedWalletKey,
        currency: chosenBankAccount.currency,
        label: chosenBankAccount.label,
      });
      setLinks(next);
      resetForm();
      hapticLight();
      toast.show(t('settings', 'bankConnected'));
    } catch (error) {
      toast.show(error instanceof Error ? error.message : t('settings', 'saveFailed'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async (bankAccountId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      setLinks(await unlinkMonobankAccount(bankAccountId));
      hapticLight();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : t('settings', 'saveFailed'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  return (
    <SettingsSection label={t('settings', 'bankTitle')} description={t('settings', 'bankDescription')}>
      {links.map((link) => (
        <div key={`${link.provider}:${link.bankAccountId}`} className={styles.linkedRow}>
          <span className={styles.linkedLabels}>
            <span className={styles.linkedTitle}>{link.label}</span>
            <span className={styles.linkedSub}>
              {t('settings', 'bankWritesTo')} {link.accountName ?? link.accountKey}
            </span>
          </span>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => void handleUnlink(link.bankAccountId)}
            disabled={busy}
            aria-label={t('settings', 'bankDisconnect')}
          >
            <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      ))}

      <div className={styles.form}>
        {bankAccounts === null ? (
          <>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('settings', 'bankTokenLabel')}</span>
              <input
                className={styles.input}
                type="password"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={t('settings', 'bankTokenPlaceholder')}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <p className={styles.hint}>{t('settings', 'bankTokenHint')}</p>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void handleLoadAccounts()}
              disabled={busy || token.trim().length < 20}
            >
              {busy ? <Loader2 size={16} className={styles.spin} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
              {t('settings', 'bankLoadAccounts')}
            </button>
          </>
        ) : (
          <>
            <span className={styles.fieldLabel}>{t('settings', 'bankChooseAccount')}</span>
            <div className={styles.options}>
              {bankAccounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  className={`${styles.option} ${selectedBankAccount === account.id ? styles.optionActive : ''}`}
                  onClick={() => setSelectedBankAccount(account.id)}
                  disabled={!account.supported}
                >
                  <span>{account.label}</span>
                  <span className={styles.optionMeta}>
                    {account.supported ? account.currency : t('settings', 'bankUnsupportedCurrency')}
                  </span>
                </button>
              ))}
            </div>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('settings', 'bankChooseWallet')}</span>
              <select
                className={styles.input}
                value={selectedWalletKey}
                onChange={(e) => setSelectedWalletKey(e.target.value)}
                disabled={walletOptions.length === 0}
              >
                <option value="">—</option>
                {walletOptions.map((account) => (
                  <option key={account.accountKey} value={account.accountKey}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            {walletOptions.length === 0 ? (
              <p className={styles.hint}>{t('settings', 'bankNoWalletAccount')}</p>
            ) : null}

            <div className={styles.actions}>
              <button type="button" className={styles.cancelBtn} onClick={resetForm} disabled={busy}>
                {t('addTx', 'cancel')}
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => void handleConnect()}
                disabled={busy || !chosenBankAccount || !selectedWalletKey}
              >
                {t('settings', 'bankConnect')}
              </button>
            </div>
          </>
        )}
      </div>

      <p className={styles.howTo}>{t('settings', 'bankHowTo')}</p>
    </SettingsSection>
  );
};

export default BankLinkSection;
