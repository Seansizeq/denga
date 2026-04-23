import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import styles from './AccountEditSheet.module.css';

export type EditableAccount = {
  accountKey: string;
  section: 'bank' | 'cash' | 'crypto' | 'debt';
  sortIndex: number;
  name: string;
  primaryAmount: number;
  primaryCurrency: 'UAH' | 'PLN';
  subText: string;
  iconTone: 'bank' | 'cash' | 'crypto' | 'debt' | 'neutral';
  badge: string;
  debtPhrase: string;
};

interface AccountEditSheetProps {
  initial: EditableAccount;
  onClose: () => void;
  onSave: (next: EditableAccount) => Promise<void>;
}

const parseMoney = (raw: string): number | null => {
  const clean = raw.replace(/\s+/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
};

const AccountEditSheet: React.FC<AccountEditSheetProps> = ({ initial, onClose, onSave }) => {
  const [name, setName] = useState(() => initial.name);
  const [amount, setAmount] = useState(() => String(initial.primaryAmount));
  const [currency, setCurrency] = useState<'UAH' | 'PLN'>(() => initial.primaryCurrency);
  const [subText, setSubText] = useState(() => initial.subText);
  const [badge, setBadge] = useState(() => initial.badge);
  const [debtPhrase, setDebtPhrase] = useState(() => initial.debtPhrase);
  const [iconTone, setIconTone] = useState<EditableAccount['iconTone']>(() => initial.iconTone);
  const [saving, setSaving] = useState(false);

  const canEditDebtPhrase = useMemo(() => initial.section === 'debt', [initial.section]);
  const isCreateMode = useMemo(() => !initial.accountKey.trim(), [initial.accountKey]);

  const handleSave = async () => {
    const n = parseMoney(amount);
    if (!name.trim() || n === null) return;
    setSaving(true);
    try {
      await onSave({
        ...initial,
        name: name.trim(),
        primaryAmount: n,
        primaryCurrency: currency,
        subText: subText.trim(),
        badge: badge.trim(),
        debtPhrase: debtPhrase.trim(),
        iconTone,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="Close" />

      <div className={styles.sheet}>
        <div className={styles.sheetHeader}>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.4} />
          </button>
          <h2 className={styles.title}>{isCreateMode ? 'Новий акаунт' : 'Редагувати акаунт'}</h2>
          <span className={styles.headerSpacer} />
        </div>

        <div className={styles.body}>
          <label className={styles.label}>
            Назва
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </label>

          <div className={styles.row2}>
            <label className={styles.label}>
              Сума
              <input className={styles.input} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </label>
            <label className={styles.label}>
              Валюта
              <select className={styles.select} value={currency} onChange={(e) => setCurrency(e.target.value === 'PLN' ? 'PLN' : 'UAH')}>
                <option value="UAH">UAH (₴)</option>
                <option value="PLN">PLN (zł)</option>
              </select>
            </label>
          </div>

          <label className={styles.label}>
            Підпис (крипта / деталі)
            <input className={styles.input} value={subText} onChange={(e) => setSubText(e.target.value)} maxLength={80} />
          </label>

          <div className={styles.row2}>
            <label className={styles.label}>
              Бейдж
              <input className={styles.input} value={badge} onChange={(e) => setBadge(e.target.value)} maxLength={3} />
            </label>
            <label className={styles.label}>
              Тон іконки
              <select
                className={styles.select}
                value={iconTone}
                onChange={(e) => setIconTone(e.target.value as EditableAccount['iconTone'])}
              >
                <option value="bank">bank</option>
                <option value="cash">cash</option>
                <option value="crypto">crypto</option>
                <option value="debt">debt</option>
                <option value="neutral">neutral</option>
              </select>
            </label>
          </div>

          {canEditDebtPhrase ? (
            <label className={styles.label}>
              Фраза боргу
              <input className={styles.input} value={debtPhrase} onChange={(e) => setDebtPhrase(e.target.value)} maxLength={40} />
            </label>
          ) : null}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={saving}>
            Скасувати
          </button>
          <button type="button" className={styles.primary} onClick={handleSave} disabled={saving || !name.trim() || parseMoney(amount) === null}>
            {saving ? 'Збереження…' : isCreateMode ? 'Створити' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountEditSheet;
