import React, { useMemo, useState } from 'react';

import { useTranslation } from '../../i18n/LanguageContext';
import { formatDate } from '../../utils/formatters';
import { MONEY_MASK, isMoneyHidden } from '../../utils/moneyPrivacy';
import type { Transaction } from '../../types';
import type { Denomination } from '../../utils/denomination';
import { AccountRowAvatar } from './AccountRowAvatar';
import sheetStyles from './FormSheet.module.css';
import styles from './DebtDetailSheet.module.css';

type DebtAccount = {
  accountKey: string;
  name: string;
  primaryAmount: number;
  primaryCurrency: Denomination;
  debtDirection: 'owed_to_me' | 'owed_by_me' | null;
  debtInitialAmount: number | null;
  debtCreatedAt: string | null;
  iconTone: 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt' | 'goal' | 'neutral';
  iconKey: string | null;
};

type PaymentAccount = {
  accountKey: string;
  name: string;
  primaryCurrency: Denomination;
};

interface DebtDetailSheetProps {
  account: DebtAccount;
  repayments: Transaction[];
  paymentAccounts: PaymentAccount[];
  onClose: () => void;
  onPayment: (accountKey: string, amount: number, note: string, paymentAccountKey: string) => Promise<void>;
  onEdit: () => void;
}

const parseMoney = (raw: string): number | null => {
  const clean = raw.replace(/\s+/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const formatAmount = (amount: number, currency: string) => {
  const abs = isMoneyHidden()
    ? MONEY_MASK
    : Math.abs(amount).toLocaleString('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
  const suffix = currency === 'PLN' ? 'zł' : currency;
  return `${abs} ${suffix}`;
};

const DebtDetailSheet: React.FC<DebtDetailSheetProps> = ({
  account,
  repayments,
  paymentAccounts,
  onClose,
  onPayment,
  onEdit,
}) => {
  const { t, locale } = useTranslation();
  const [mode, setMode] = useState<'view' | 'pay'>('view');
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [paymentAccountKey, setPaymentAccountKey] = useState(() => paymentAccounts[0]?.accountKey ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const phrase = t('balance', account.debtDirection === 'owed_by_me' ? 'debtPhraseOwedByMe' : 'debtPhraseOwedToMe');
  const formattedBalance = formatAmount(account.primaryAmount, account.primaryCurrency);
  const initialAmount = Math.max(account.primaryAmount, account.debtInitialAmount ?? account.primaryAmount);
  const paidAmount = Math.max(0, initialAmount - account.primaryAmount);
  const progress = initialAmount > 0 ? Math.min(100, Math.round((paidAmount / initialAmount) * 100)) : 0;
  const parsedPayment = useMemo(() => parseMoney(payAmount), [payAmount]);
  const canSubmit = Boolean(
    parsedPayment && parsedPayment <= account.primaryAmount && paymentAccountKey && paymentAccounts.length > 0,
  );

  const handleConfirmPayment = async () => {
    if (!parsedPayment) return;
    if (parsedPayment > account.primaryAmount) {
      setError(t('balance', 'debtPaymentExceedsBalance'));
      return;
    }
    if (!paymentAccountKey) {
      setError(t('balance', 'debtPaymentAccountRequired'));
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onPayment(account.accountKey, parsedPayment, payNote.trim(), paymentAccountKey);
      setSuccess(true);
      window.setTimeout(() => onClose(), 900);
    } catch {
      setError(t('balance', 'debtPaymentFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={sheetStyles.overlay} role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('balance', 'debtSheetTitle')}
        className={sheetStyles.sheet}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={sheetStyles.grabber} aria-hidden="true" />
        <header className={sheetStyles.header}>
          <button
            type="button"
            className={`${sheetStyles.headerPill} ${sheetStyles.headerPillGhost}`}
            onClick={onClose}
          >
            {t('balance', 'close')}
          </button>
          <h2 className={sheetStyles.title}>{t('balance', 'debtSheetTitle')}</h2>
          <button
            type="button"
            className={`${sheetStyles.headerPill} ${sheetStyles.headerPillGhost}`}
            onClick={onEdit}
          >
            {t('subscriptions', 'edit')}
          </button>
        </header>

        <div className={sheetStyles.body}>
          <div className={styles.debtCard}>
            <AccountRowAvatar
              accountKey={account.accountKey}
              iconTone={account.iconTone}
              section="debt"
              iconKey={account.iconKey}
              glyphSize={22}
              classNameCircle={styles.bigAvatar}
            />
            <div className={styles.debtInfo}>
              <span className={styles.debtName}>{account.name}</span>
              <span className={styles.debtPhrase}>{phrase}</span>
              <span className={styles.debtBalance}>{formattedBalance}</span>
            </div>
          </div>

          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span>{t('balance', 'debtInitialAmount')}</span>
              <strong>{formatAmount(initialAmount, account.primaryCurrency)}</strong>
            </div>
            <div className={styles.summaryItem}>
              <span>{t('balance', 'debtPaidAmount')}</span>
              <strong>{formatAmount(paidAmount, account.primaryCurrency)}</strong>
            </div>
            <div className={styles.progressItem}>
              <div className={styles.progressHeader}>
                <span>{t('balance', 'debtRemainingAmount')}</span>
                <strong>{progress}%</strong>
              </div>
              <div className={styles.progressTrack} aria-label={`${progress}%`}>
                <span className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          {success ? (
            <div className={styles.successMsg}>✓ {t('balance', 'debtPaymentRecorded')}</div>
          ) : mode === 'view' ? (
            <button
              type="button"
              className={styles.payBtn}
              onClick={() => setMode('pay')}
              disabled={account.primaryAmount <= 0}
            >
              {t('balance', 'debtRecordPayment')}
            </button>
          ) : (
            <div className={styles.payForm}>
              <div className={sheetStyles.group}>
                <label className={sheetStyles.row}>
                  <span className={sheetStyles.rowLabel}>{t('balance', 'debtPaymentAmountLabel')}</span>
                  <input
                    className={sheetStyles.rowField}
                    value={payAmount}
                    onChange={(e) => { setPayAmount(e.target.value); setError(''); }}
                    inputMode="decimal"
                    placeholder={t('balance', 'debtPaymentAmountPlaceholder').replace('{amount}', formattedBalance)}
                    autoFocus
                  />
                </label>
                <label className={sheetStyles.row}>
                  <span className={sheetStyles.rowLabel}>{t('addTx', 'paymentAccount')}</span>
                  <select
                    className={`${sheetStyles.rowField} ${sheetStyles.rowSelect}`}
                    value={paymentAccountKey}
                    onChange={(e) => { setPaymentAccountKey(e.target.value); setError(''); }}
                  >
                    <option value="">{t('addTx', 'paymentAccountNone')}</option>
                    {paymentAccounts.map((paymentAccount) => (
                      <option key={paymentAccount.accountKey} value={paymentAccount.accountKey}>
                        {paymentAccount.name} · {paymentAccount.primaryCurrency}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={sheetStyles.row}>
                  <span className={sheetStyles.rowLabel}>{t('balance', 'debtPaymentNoteLabel')}</span>
                  <input
                    className={sheetStyles.rowField}
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    placeholder={t('balance', 'debtPaymentNotePlaceholder')}
                    maxLength={80}
                  />
                </label>
              </div>
              {paymentAccounts.length === 0 ? <p className={sheetStyles.error}>{t('balance', 'debtPaymentAccountRequired')}</p> : null}
              {error ? <p className={sheetStyles.error}>{error}</p> : null}
              <div className={styles.payActions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => { setMode('view'); setPayAmount(''); setPayNote(''); setError(''); }}
                  disabled={saving}
                >
                  {t('addTx', 'cancel')}
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={handleConfirmPayment}
                  disabled={saving || !canSubmit}
                >
                  {saving ? `${t('addTx', 'save')}...` : t('balance', 'confirm')}
                </button>
              </div>
            </div>
          )}

          {repayments.length > 0 ? (
            <div className={styles.historySection}>
              <p className={styles.historyTitle}>{t('balance', 'debtRepaymentHistoryTitle')}</p>
              <ul className={styles.historyList} role="list">
                {repayments.map((tx) => (
                  <li key={tx.id} className={styles.historyItem}>
                    <span className={styles.historyDate}>{formatDate(tx.date, locale)}</span>
                    <span className={styles.historyAmount}>{formatAmount(tx.amount, account.primaryCurrency)}</span>
                    {tx.note ? <span className={styles.historyNote}>{tx.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default DebtDetailSheet;
