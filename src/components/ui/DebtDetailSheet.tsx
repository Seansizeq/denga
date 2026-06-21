import React, { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { AccountRowAvatar } from './AccountRowAvatar';
import styles from './DebtDetailSheet.module.css';

type DebtAccount = {
  accountKey: string;
  name: string;
  primaryAmount: number;
  primaryCurrency: 'UAH' | 'PLN';
  debtPhrase: string | null;
  iconTone: 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt' | 'neutral';
  iconKey: string | null;
};

interface DebtDetailSheetProps {
  account: DebtAccount;
  onClose: () => void;
  onPayment: (accountKey: string, amount: number, note: string) => Promise<void>;
  onEdit: () => void;
}

const parseMoney = (raw: string): number | null => {
  const clean = raw.replace(/\s+/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const formatAmount = (amount: number, currency: string) => {
  const abs = Math.abs(amount).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const suffix = currency === 'PLN' ? 'zł' : currency;
  return `${abs} ${suffix}`;
};

const DebtDetailSheet: React.FC<DebtDetailSheetProps> = ({ account, onClose, onPayment, onEdit }) => {
  const [mode, setMode] = useState<'view' | 'pay'>('view');
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const phrase = account.debtPhrase?.trim() || 'борг';
  const formattedBalance = formatAmount(account.primaryAmount, account.primaryCurrency);

  const handleConfirmPayment = async () => {
    const n = parseMoney(payAmount);
    if (!n) return;
    setError('');
    setSaving(true);
    try {
      await onPayment(account.accountKey, n, payNote.trim());
      setSuccess(true);
      setTimeout(() => onClose(), 900);
    } catch {
      setError('Не вдалося зафіксувати. Спробуй ще раз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="Закрити" />

      <div className={styles.sheet}>
        {/* Header */}
        <div className={styles.header}>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Закрити">
            <X size={18} strokeWidth={2.4} />
          </button>
          <span className={styles.title}>Борг</span>
          <button type="button" className={styles.editBtn} onClick={onEdit} aria-label="Редагувати">
            <Pencil size={15} strokeWidth={2.4} />
          </button>
        </div>

        <div className={styles.body}>
          {/* Debt overview */}
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

          {success ? (
            <div className={styles.successMsg}>✓ Зафіксовано</div>
          ) : mode === 'view' ? (
            <button
              type="button"
              className={styles.payBtn}
              onClick={() => setMode('pay')}
              disabled={account.primaryAmount <= 0}
            >
              Записати повернення
            </button>
          ) : (
            <div className={styles.payForm}>
              <label className={styles.label}>
                Сума повернення
                <input
                  className={styles.input}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder={`до ${formattedBalance}`}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
              </label>
              <label className={styles.label}>
                Нотатка (необов'язково)
                <input
                  className={styles.input}
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Повернув готівкою..."
                  maxLength={80}
                />
              </label>
              {error ? <p className={styles.error}>{error}</p> : null}
              <div className={styles.payActions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => { setMode('view'); setPayAmount(''); setPayNote(''); setError(''); }}
                  disabled={saving}
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={handleConfirmPayment}
                  disabled={saving || !parseMoney(payAmount)}
                >
                  {saving ? 'Зберігаю...' : 'Підтвердити'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DebtDetailSheet;
