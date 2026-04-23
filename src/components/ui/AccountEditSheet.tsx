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
  onDelete?: (accountKey: string) => Promise<void>;
}

const parseMoney = (raw: string): number | null => {
  const clean = raw.replace(/\s+/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
};

const COLOR_OPTIONS: Array<{ tone: EditableAccount['iconTone']; label: string; swatch: string }> = [
  { tone: 'bank', label: 'Жовтий', swatch: '#ffb020' },
  { tone: 'cash', label: 'Фіолетовий', swatch: '#8f74ff' },
  { tone: 'crypto', label: 'Блакитний', swatch: '#58b7ff' },
  { tone: 'debt', label: 'Червоний', swatch: '#ff6b6b' },
  { tone: 'neutral', label: 'Нейтральний', swatch: '#73737c' },
];

const AccountEditSheet: React.FC<AccountEditSheetProps> = ({ initial, onClose, onSave, onDelete }) => {
  const [name, setName] = useState(() => initial.name);
  const [amount, setAmount] = useState(() => String(initial.primaryAmount));
  const [currency, setCurrency] = useState<'UAH' | 'PLN'>(() => initial.primaryCurrency);
  const [section, setSection] = useState<EditableAccount['section']>(() => initial.section);
  const [badge, setBadge] = useState(() => initial.badge);
  const [debtPhrase, setDebtPhrase] = useState(() => initial.debtPhrase);
  const [iconTone, setIconTone] = useState<EditableAccount['iconTone']>(() => initial.iconTone);
  const [saving, setSaving] = useState(false);

  const canEditDebtPhrase = useMemo(() => section === 'debt', [section]);
  const isCreateMode = useMemo(() => !initial.accountKey.trim(), [initial.accountKey]);

  const handleSave = async () => {
    const n = parseMoney(amount);
    if (!name.trim() || n === null) return;
    setSaving(true);
    try {
      await onSave({
        ...initial,
        section,
        name: name.trim(),
        primaryAmount: n,
        primaryCurrency: currency,
        subText: initial.subText,
        badge: badge.trim(),
        debtPhrase: debtPhrase.trim(),
        iconTone,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || isCreateMode) return;
    const ok = window.confirm('Видалити цей акаунт?');
    if (!ok) return;
    setSaving(true);
    try {
      await onDelete(initial.accountKey);
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

          <div className={styles.row2}>
            <label className={styles.label}>
              Бейдж
              <input className={styles.input} value={badge} onChange={(e) => setBadge(e.target.value)} maxLength={3} />
            </label>
            <label className={styles.label}>
              Розділ
              <select
                className={styles.select}
                value={section}
                onChange={(e) => setSection((e.target.value as EditableAccount['section']) ?? 'bank')}
              >
                <option value="bank">Карти</option>
                <option value="cash">Готівка</option>
                <option value="crypto">Крипта</option>
                <option value="debt">Борг</option>
              </select>
            </label>
          </div>

          <fieldset className={styles.colorFieldset}>
            <legend className={styles.label}>Колір</legend>
            <div className={styles.colorGrid}>
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.tone}
                  type="button"
                  className={`${styles.colorButton} ${iconTone === option.tone ? styles.colorButtonActive : ''}`}
                  onClick={() => setIconTone(option.tone)}
                  aria-pressed={iconTone === option.tone}
                >
                  <span className={styles.colorSwatch} style={{ backgroundColor: option.swatch }} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {canEditDebtPhrase ? (
            <label className={styles.label}>
              Фраза боргу
              <input className={styles.input} value={debtPhrase} onChange={(e) => setDebtPhrase(e.target.value)} maxLength={40} />
            </label>
          ) : null}
        </div>

        <div className={styles.footer}>
          {!isCreateMode && onDelete ? (
            <button type="button" className={styles.danger} onClick={handleDelete} disabled={saving}>
              Видалити
            </button>
          ) : null}
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
