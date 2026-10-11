import React, { useEffect, useMemo, useState } from 'react';

import { useTranslation } from '../../i18n/LanguageContext';
import type { CategoryKey } from '../../i18n/translations';
import { findCategory, getCustomCategoryData } from '../../constants/categories';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { isMoneyHidden } from '../../utils/moneyPrivacy';
import { localIsoDate } from '../../utils/dateRanges';
import { debtMovementDrainsAccount } from '../../utils/debtMovement';
import type { Denomination } from '../../utils/denomination';
import { useDenominationRates } from '../../hooks/useDenominationRates';
import { useAccountNames } from '../../hooks/useAccountNames';
import {
  DebtRequestError,
  fetchDebtHistory,
  type DebtHistory,
  type DebtHistoryEntry,
  type DebtMovementInput,
  type DebtMovementKind,
} from '../../api/debts';
import { AccountRowAvatar } from './AccountRowAvatar';
import sheetStyles from './FormSheet.module.css';
import styles from './DebtDetailSheet.module.css';

type DebtAccount = {
  accountKey: string;
  name: string;
  primaryAmount: number;
  primaryCurrency: Denomination;
  debtDirection: 'owed_to_me' | 'owed_by_me' | null;
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
  /** Банк і готівка в будь-якій валюті: іншу сервер перерахує за курсом. */
  paymentAccounts: PaymentAccount[];
  onClose: () => void;
  onMovement: (accountKey: string, input: DebtMovementInput) => Promise<void>;
  onEdit: () => void;
}

const parseMoney = (raw: string): number | null => {
  const clean = raw.replace(/\s+/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Історія, прочитана для конкретного стану боргу; інший стан — читати наново. */
type LoadedHistory = { stamp: string; data: DebtHistory | null; failed: boolean };

const DebtDetailSheet: React.FC<DebtDetailSheetProps> = ({
  account,
  paymentAccounts,
  onClose,
  onMovement,
  onEdit,
}) => {
  const { t, locale } = useTranslation();
  const { convert } = useDenominationRates();
  const resolveAccountName = useAccountNames();
  const owedByMe = account.debtDirection === 'owed_by_me';
  const currency = account.primaryCurrency;

  const [mode, setMode] = useState<'view' | DebtMovementKind>('view');
  const [amount, setAmount] = useState('');
  const [accountSideAmount, setAccountSideAmount] = useState('');
  const [date, setDate] = useState(() => localIsoDate());
  const [note, setNote] = useState('');
  const [paymentAccountKey, setPaymentAccountKey] = useState(
    () =>
      paymentAccounts.find((row) => row.primaryCurrency === currency)?.accountKey
      ?? paymentAccounts[0]?.accountKey
      ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [history, setHistory] = useState<LoadedHistory | null>(null);

  // Баланс у ключі: щойно рахунок оновився (запис тут чи деінде), історія
  // перечитується, і підсумки сходяться з тим, що видно в картці. Кожен рух
  // боргу міняє баланс, тож окремого «перечитай» не потрібно.
  const historyStamp = `${account.accountKey}|${account.primaryAmount}`;
  useEffect(() => {
    let cancelled = false;
    fetchDebtHistory(account.accountKey)
      .then((data) => {
        if (!cancelled) setHistory({ stamp: historyStamp, data, failed: false });
      })
      .catch(() => {
        if (!cancelled) setHistory({ stamp: historyStamp, data: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [account.accountKey, historyStamp]);
  // Поки свіжа відповідь не прийшла, показуємо попередню — так підсумки не блимають.
  const historyData = history?.data ?? null;
  const historyLoading = !history || (history.stamp !== historyStamp && !history.data);
  const historyFailed = Boolean(history?.failed) && history?.stamp === historyStamp;

  const money = (value: number, unit: Denomination = currency) => formatCurrency(value, locale, unit);
  const phrase = t('balance', owedByMe ? 'debtPhraseOwedByMe' : 'debtPhraseOwedToMe');
  const progress = historyData ? Math.round(historyData.progress * 100) : 0;

  const selectedPayment = paymentAccounts.find((row) => row.accountKey === paymentAccountKey) ?? null;
  const parsedAmount = useMemo(() => parseMoney(amount), [amount]);
  const parsedAccountSide = useMemo(() => parseMoney(accountSideAmount), [accountSideAmount]);
  const crossCurrency = Boolean(selectedPayment && selectedPayment.primaryCurrency !== currency);
  const accountSideEstimate =
    crossCurrency && parsedAmount && selectedPayment
      ? convert(parsedAmount, currency, selectedPayment.primaryCurrency)
      : null;
  const exceedsBalance = mode === 'repayment' && parsedAmount !== null && parsedAmount > account.primaryAmount + 1e-9;
  const canSubmit = Boolean(parsedAmount && selectedPayment && !exceedsBalance && !saving && date);

  const resetForm = () => {
    setMode('view');
    setAmount('');
    setAccountSideAmount('');
    setNote('');
    setDate(localIsoDate());
    setError('');
  };

  const openForm = (kind: DebtMovementKind) => {
    resetForm();
    setSuccess(false);
    setMode(kind);
  };

  const handleSubmit = async () => {
    if (mode === 'view' || !parsedAmount || !selectedPayment) return;
    if (exceedsBalance) {
      setError(t('balance', 'debtPaymentExceedsBalance').replace('{amount}', money(account.primaryAmount)));
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onMovement(account.accountKey, {
        kind: mode,
        amount: parsedAmount,
        paymentAccountKey: selectedPayment.accountKey,
        ...(crossCurrency && parsedAccountSide ? { paymentAmount: parsedAccountSide } : {}),
        // Сьогоднішній день не надсилається: сервер поставить точний час, і
        // кілька записів за день стануть у тому порядку, в якому їх зробили.
        ...(date !== localIsoDate() ? { date } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      resetForm();
      setSuccess(true);
      window.setTimeout(() => setSuccess(false), 1500);
    } catch (e) {
      const code = e instanceof DebtRequestError ? e.code : '';
      if (code === 'DEBT_PAYMENT_EXCEEDS_BALANCE') {
        const available = e instanceof DebtRequestError && e.available !== null ? e.available : account.primaryAmount;
        setError(t('balance', 'debtPaymentExceedsBalance').replace('{amount}', money(available)));
      } else if (code === 'PAYMENT_RATE_UNAVAILABLE' || code === 'ACCOUNT_DENOMINATION_MISMATCH') {
        setError(t('balance', 'debtPaymentRateUnavailable'));
      } else if (code === 'PAYMENT_ACCOUNT_REQUIRED') {
        setError(t('balance', 'debtPaymentAccountRequired'));
      } else {
        setError(t('balance', 'debtPaymentFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const entryTitle = (entry: DebtHistoryEntry): string => {
    switch (entry.kind) {
      case 'opening':
        return t('balance', 'debtEntryOpening');
      case 'adjustment':
        return t('balance', 'debtEntryAdjustment');
      case 'repayment':
        return t('balance', owedByMe ? 'debtEntryRepaidByMe' : 'debtEntryRepaidToMe');
      case 'increase':
        return t('balance', owedByMe ? 'debtEntryBorrowed' : 'debtEntryLent');
      default: {
        const id = entry.categoryId ?? '';
        const custom = getCustomCategoryData(id);
        if (custom) return custom.name;
        return t('categories', findCategory(id, entry.kind).id as CategoryKey);
      }
    }
  };

  const amountLabel =
    mode === 'repayment'
      ? t('balance', 'debtPaymentAmountLabel')
      : t('balance', owedByMe ? 'debtBorrowAmountLabel' : 'debtLendAmountLabel');
  const accountLabel =
    mode !== 'view' && debtMovementDrainsAccount(mode, account.debtDirection)
      ? t('balance', 'debtAccountFromLabel')
      : t('balance', 'debtAccountToLabel');

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
              <span className={styles.debtBalance}>{money(account.primaryAmount)}</span>
            </div>
          </div>

          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span>{t('balance', owedByMe ? 'debtTotalOwedByMe' : 'debtTotalOwedToMe')}</span>
              <strong>{historyData ? money(historyData.total) : '—'}</strong>
            </div>
            <div className={styles.summaryItem}>
              <span>{t('balance', 'debtPaidAmount')}</span>
              <strong>{historyData ? money(historyData.repaid) : '—'}</strong>
            </div>
            {historyData && historyData.writtenOff > 0 ? (
              <div className={`${styles.summaryItem} ${styles.summaryWide}`}>
                <span>{t('balance', 'debtWrittenOff')}</span>
                <strong>{money(historyData.writtenOff)}</strong>
              </div>
            ) : null}
            <div className={styles.progressItem}>
              <div className={styles.progressHeader}>
                <span>{t('balance', 'debtRemainingAmount')}</span>
                <strong>{historyData ? `${progress}%` : '—'}</strong>
              </div>
              <div className={styles.progressTrack} aria-label={`${progress}%`}>
                <span className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          {success ? <div className={styles.successMsg}>✓ {t('balance', 'debtPaymentRecorded')}</div> : null}

          {mode === 'view' ? (
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.payBtn}
                onClick={() => openForm('repayment')}
                disabled={account.primaryAmount <= 0}
              >
                {t('balance', 'debtActionRepay')}
              </button>
              <button type="button" className={styles.moreBtn} onClick={() => openForm('increase')}>
                {t('balance', owedByMe ? 'debtActionBorrowMore' : 'debtActionLendMore')}
              </button>
            </div>
          ) : (
            <div className={styles.payForm}>
              <div className={sheetStyles.group}>
                <label className={sheetStyles.row}>
                  <span className={sheetStyles.rowLabel}>{amountLabel}</span>
                  <input
                    className={sheetStyles.rowField}
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setError(''); }}
                    inputMode="decimal"
                    placeholder={
                      mode === 'repayment'
                        ? t('balance', 'debtPaymentAmountPlaceholder').replace('{amount}', money(account.primaryAmount))
                        : currency
                    }
                    autoFocus
                  />
                </label>
                <label className={sheetStyles.row}>
                  <span className={sheetStyles.rowLabel}>{accountLabel}</span>
                  <select
                    className={`${sheetStyles.rowField} ${sheetStyles.rowSelect}`}
                    value={paymentAccountKey}
                    onChange={(e) => { setPaymentAccountKey(e.target.value); setAccountSideAmount(''); setError(''); }}
                  >
                    {paymentAccounts.map((paymentAccount) => (
                      <option key={paymentAccount.accountKey} value={paymentAccount.accountKey}>
                        {paymentAccount.name} · {paymentAccount.primaryCurrency}
                      </option>
                    ))}
                  </select>
                </label>
                {crossCurrency && selectedPayment ? (
                  <label className={sheetStyles.row}>
                    <span className={sheetStyles.rowLabel}>
                      {t('balance', 'debtAccountSideAmountLabel').replace('{currency}', selectedPayment.primaryCurrency)}
                    </span>
                    <input
                      className={sheetStyles.rowField}
                      value={accountSideAmount}
                      onChange={(e) => { setAccountSideAmount(e.target.value); setError(''); }}
                      inputMode="decimal"
                      placeholder={
                        accountSideEstimate !== null && !isMoneyHidden()
                          ? `≈ ${money(accountSideEstimate, selectedPayment.primaryCurrency)}`
                          : ''
                      }
                    />
                  </label>
                ) : null}
                <label className={sheetStyles.row}>
                  <span className={sheetStyles.rowLabel}>{t('balance', 'debtDateLabel')}</span>
                  <input
                    type="date"
                    className={sheetStyles.rowDatePill}
                    value={date}
                    max={localIsoDate()}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label className={sheetStyles.row}>
                  <span className={sheetStyles.rowLabel}>{t('balance', 'debtPaymentNoteLabel')}</span>
                  <input
                    className={sheetStyles.rowField}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t(
                      'balance',
                      mode === 'repayment' ? 'debtPaymentNotePlaceholder' : 'debtIncreaseNotePlaceholder',
                    )}
                    maxLength={80}
                  />
                </label>
              </div>
              {paymentAccounts.length === 0 ? <p className={sheetStyles.error}>{t('balance', 'debtPaymentAccountRequired')}</p> : null}
              {error ? <p className={sheetStyles.error}>{error}</p> : null}
              <div className={styles.payActions}>
                <button type="button" className={styles.secondary} onClick={resetForm} disabled={saving}>
                  {t('addTx', 'cancel')}
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => void handleSubmit()}
                  disabled={!canSubmit}
                >
                  {saving ? `${t('addTx', 'save')}...` : t('balance', 'confirm')}
                </button>
              </div>
            </div>
          )}

          <div className={styles.historySection}>
            <p className={styles.historyTitle}>{t('balance', 'debtHistoryTitle')}</p>
            {historyFailed ? (
              <p className={styles.historyHint}>{t('balance', 'debtHistoryLoadFailed')}</p>
            ) : historyLoading ? (
              <p className={styles.historyHint}>…</p>
            ) : !historyData || historyData.entries.length === 0 ? (
              <p className={styles.historyHint}>{t('balance', 'debtHistoryEmpty')}</p>
            ) : (
              <ul className={styles.historyList} role="list">
                {historyData.entries.map((entry) => {
                  const detail = [
                    entry.counterpartAccountKey ? resolveAccountName(entry.counterpartAccountKey) : '',
                    entry.note ?? '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <li key={entry.id} className={styles.historyItem}>
                      <div className={styles.historyMain}>
                        <span className={styles.historyLabel}>{entryTitle(entry)}</span>
                        <span className={styles.historyNote}>
                          {[formatDate(entry.date, locale), detail].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                      <span
                        className={`${styles.historyAmount} ${entry.delta < 0 ? styles.historyDown : styles.historyUp}`}
                      >
                        {isMoneyHidden() ? '' : entry.delta < 0 ? '−' : '+'}
                        {money(Math.abs(entry.delta))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default DebtDetailSheet;
