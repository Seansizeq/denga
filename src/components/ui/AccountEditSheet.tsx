import React, { useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import { AccountIconGlyph, type AccountIconKey } from '../../utils/accountIcons';
import { parseCryptoPosition } from '../../utils/cryptoPosition';
import { AccountRowAvatar } from './AccountRowAvatar';
import styles from './AccountEditSheet.module.css';

export type EditableAccount = {
  accountKey: string;
  section: 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt';
  sortIndex: number;
  name: string;
  primaryAmount: number;
  primaryCurrency: 'UAH' | 'PLN';
  subText: string;
  iconTone: 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt' | 'neutral';
  badge: string;
  /** Empty string = automatic icon from section / account key. */
  iconKey: string;
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
  { tone: 'bank',    label: 'Жовтий',      swatch: '#ffb020' },
  { tone: 'cash',    label: 'Фіолетовий',  swatch: '#8f74ff' },
  { tone: 'crypto',  label: 'Блакитний',   swatch: '#58b7ff' },
  { tone: 'stocks',  label: 'Зелений',     swatch: '#4ade80' },
  { tone: 'debt',    label: 'Червоний',    swatch: '#ff6b6b' },
  { tone: 'neutral', label: 'Нейтральний', swatch: '#73737c' },
];

const LUCIDE_PICKS: Array<{ key: Exclude<AccountIconKey, 'auto'>; label: string }> = [
  { key: 'CreditCard',       label: 'Картка'   },
  { key: 'Landmark',         label: 'Банк'     },
  { key: 'Wallet',           label: 'Гаманець' },
  { key: 'Banknote',         label: 'Готівка'  },
  { key: 'PiggyBank',        label: 'Заощад.'  },
  { key: 'Coins',            label: 'Крипта'   },
  { key: 'TrendingUp',       label: 'Акції'    },
  { key: 'CircleDollarSign', label: 'Стейбл'   },
  { key: 'HandCoins',        label: 'Борг'     },
];

const AccountEditSheet: React.FC<AccountEditSheetProps> = ({ initial, onClose, onSave, onDelete }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(() => initial.name);
  const [amount, setAmount] = useState(() => String(initial.primaryAmount));
  const [currency, setCurrency] = useState<'UAH' | 'PLN'>(() => initial.primaryCurrency);
  const [section, setSection] = useState<EditableAccount['section']>(() => initial.section);
  const [badge, setBadge] = useState(() => initial.badge);
  const [iconKey, setIconKey] = useState(() => (initial.iconKey ?? '').trim());
  const [debtPhrase, setDebtPhrase] = useState(() => initial.debtPhrase);
  const [iconTone, setIconTone] = useState<EditableAccount['iconTone']>(() => initial.iconTone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canEditDebtPhrase = useMemo(() => section === 'debt', [section]);
  const isCreateMode = useMemo(() => !initial.accountKey.trim(), [initial.accountKey]);

  const previewAccountKey = useMemo(() => {
    const k = initial.accountKey.trim();
    if (k) return k;
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return slug || 'account';
  }, [initial.accountKey, name]);

  const previewCryptoSymbol = useMemo(() => {
    if (section !== 'crypto') return null;
    return parseCryptoPosition(initial.subText)?.symbol ?? null;
  }, [section, initial.subText]);

  const handleSave = async () => {
    const n = parseMoney(amount);
    if (!name.trim() || n === null) return;
    setError('');
    setSaving(true);
    try {
      await onSave({
        ...initial,
        section,
        name: name.trim(),
        primaryAmount: n,
        primaryCurrency: currency,
        subText: initial.subText,
        badge: badge.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3).toUpperCase(),
        iconKey: iconKey.trim(),
        debtPhrase: debtPhrase.trim(),
        iconTone,
      });
      onClose();
    } catch {
      setError(t('addTx', 'saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || isCreateMode) return;
    setError('');
    const ok = window.confirm(t('addTx', 'deleteConfirm'));
    if (!ok) return;
    setSaving(true);
    try {
      await onDelete(initial.accountKey);
      onClose();
    } catch {
      setError(t('addTx', 'saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <button type="button" className={styles.scrim} onClick={onClose} aria-label={t('addTx', 'cancel')} />

      <div className={styles.sheet}>
        <div className={styles.sheetHeader}>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label={t('addTx', 'cancel')}>
            <X size={18} strokeWidth={2.4} />
          </button>
          <h2 className={styles.title}>{isCreateMode ? 'Новий рахунок' : 'Редагування рахунку'}</h2>
          <span className={styles.headerSpacer} />
        </div>
        {error ? <p className={styles.errorText}>{error}</p> : null}

        <div className={styles.body}>
          <div className={styles.previewRow}>
            <AccountRowAvatar
              accountKey={previewAccountKey}
              iconTone={iconTone}
              section={section}
              iconKey={iconKey || null}
              cryptoSymbol={previewCryptoSymbol}
              glyphSize={22}
            />
            <div className={styles.previewMeta}>
              <span className={styles.previewTitle}>Перегляд іконки</span>
              <span className={styles.previewName}>{name.trim() || '—'}</span>
            </div>
          </div>

          <label className={styles.label}>
            Назва
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Наприклад: ПриватБанк, Готівка..."
              autoFocus={isCreateMode}
            />
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
              Ініціали (до 3 симв.)
              <input
                className={styles.input}
                value={badge}
                onChange={(e) => setBadge(e.target.value.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3))}
                maxLength={3}
                inputMode="text"
                autoCapitalize="characters"
              />
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
                <option value="stocks">Акції</option>
                <option value="debt">Борг</option>
              </select>
            </label>
          </div>

          <fieldset className={styles.colorFieldset}>
            <legend className={styles.label}>Іконка</legend>
            <div className={styles.iconGrid}>
              <button
                type="button"
                className={`${styles.iconOption} ${styles.iconOptionWide} ${!iconKey ? styles.iconOptionActive : ''}`}
                onClick={() => setIconKey('')}
                aria-pressed={!iconKey}
              >
                <Sparkles size={20} strokeWidth={2.2} />
                Авто
              </button>
              {LUCIDE_PICKS.map((opt) => {
                const active = iconKey === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className={`${styles.iconOption} ${active ? styles.iconOptionActive : ''}`}
                    onClick={() => setIconKey(opt.key)}
                    aria-pressed={active}
                  >
                    <AccountIconGlyph iconKey={opt.key} size={20} strokeWidth={2.2} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

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
              {t('history', 'delete')}
            </button>
          ) : null}
          <button type="button" className={styles.secondary} onClick={onClose} disabled={saving}>
            {t('addTx', 'cancel')}
          </button>
          <button type="button" className={styles.primary} onClick={handleSave} disabled={saving || !name.trim() || parseMoney(amount) === null}>
            {saving ? `${t('addTx', 'save')}...` : isCreateMode ? t('addTx', 'create') : t('addTx', 'save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountEditSheet;
