import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, X } from 'lucide-react';
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

const SECTION_LABELS: Record<EditableAccount['section'], string> = {
  bank:   'Карти',
  cash:   'Готівка',
  crypto: 'Крипта',
  stocks: 'Акції',
  debt:   'Борг',
};

const SECTION_PLACEHOLDER: Record<EditableAccount['section'], string> = {
  bank:   'ПриватБанк, Монобанк...',
  cash:   'Гаманець, Каса...',
  crypto: 'Bitcoin, ETH-гаманець...',
  stocks: 'Акції США, Monobank...',
  debt:   'Михайло, Оренда...',
};

const AccountEditSheet: React.FC<AccountEditSheetProps> = ({ initial, onClose, onSave, onDelete }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(() => initial.name);
  const [amount, setAmount] = useState(() => String(initial.primaryAmount));
  const [currency, setCurrency] = useState<'UAH' | 'PLN'>(() => initial.primaryCurrency);
  const [section, setSection] = useState<EditableAccount['section']>(() => initial.section);
  const [iconKey, setIconKey] = useState(() => (initial.iconKey ?? '').trim());
  const [debtPhrase, setDebtPhrase] = useState(() => initial.debtPhrase);
  const [iconTone, setIconTone] = useState<EditableAccount['iconTone']>(() => initial.iconTone);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isCreateMode = useMemo(() => !initial.accountKey.trim(), [initial.accountKey]);

  const previewAccountKey = useMemo(() => {
    const k = initial.accountKey.trim();
    if (k) return k;
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
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
        badge: initial.badge,
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
          {/* Big preview card */}
          <div className={styles.previewCard}>
            <div className={styles.previewAvatarWrap}>
              <AccountRowAvatar
                accountKey={previewAccountKey}
                iconTone={iconTone}
                section={section}
                iconKey={iconKey || null}
                cryptoSymbol={previewCryptoSymbol}
                glyphSize={24}
              />
            </div>
            <div className={styles.previewInfo}>
              <span className={styles.previewName}>{name.trim() || 'Новий рахунок'}</span>
              <span className={styles.previewSection}>{SECTION_LABELS[section]}</span>
            </div>
          </div>

          {/* Name */}
          <label className={styles.label}>
            Назва
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder={SECTION_PLACEHOLDER[section]}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={isCreateMode}
            />
          </label>

          {/* Amount + Currency */}
          <div className={styles.row2}>
            <label className={styles.label}>
              Сума
              <input
                className={styles.input}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className={styles.label}>
              Валюта
              <select
                className={styles.select}
                value={currency}
                onChange={(e) => setCurrency(e.target.value === 'PLN' ? 'PLN' : 'UAH')}
              >
                <option value="UAH">UAH (₴)</option>
                <option value="PLN">PLN (zł)</option>
              </select>
            </label>
          </div>

          {/* Compact color circles */}
          <div className={styles.colorSection}>
            <span className={styles.colorLabel}>Колір</span>
            <div className={styles.colorRow}>
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.tone}
                  type="button"
                  className={`${styles.colorDot} ${iconTone === opt.tone ? styles.colorDotActive : ''}`}
                  style={{ backgroundColor: opt.swatch }}
                  onClick={() => setIconTone(opt.tone)}
                  aria-label={opt.label}
                  title={opt.label}
                />
              ))}
            </div>
          </div>

          {/* Debt phrase — only for debt section */}
          {section === 'debt' ? (
            <label className={styles.label}>
              Фраза боргу
              <input
                className={styles.input}
                value={debtPhrase}
                onChange={(e) => setDebtPhrase(e.target.value)}
                maxLength={40}
              />
            </label>
          ) : null}

          {/* Collapsible: icon + section */}
          <div className={styles.expandSection}>
            <button
              type="button"
              className={styles.expandBtn}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              <span>Іконка та розділ</span>
              {advancedOpen ? (
                <ChevronUp size={15} strokeWidth={2.4} />
              ) : (
                <ChevronDown size={15} strokeWidth={2.4} />
              )}
            </button>

            {advancedOpen ? (
              <div className={styles.expandContent}>
                <fieldset className={styles.colorFieldset}>
                  <legend className={styles.label}>Іконка</legend>
                  <div className={styles.iconGrid}>
                    <button
                      type="button"
                      className={`${styles.iconOption} ${styles.iconOptionWide} ${!iconKey ? styles.iconOptionActive : ''}`}
                      onClick={() => setIconKey('')}
                      aria-pressed={!iconKey}
                    >
                      <Sparkles size={18} strokeWidth={2.2} />
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
                          <AccountIconGlyph iconKey={opt.key} size={18} strokeWidth={2.2} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <label className={styles.label}>
                  Розділ
                  <select
                    className={styles.select}
                    value={section}
                    onChange={(e) => setSection(e.target.value as EditableAccount['section'])}
                  >
                    <option value="bank">Карти</option>
                    <option value="cash">Готівка</option>
                    <option value="crypto">Крипта</option>
                    <option value="stocks">Акції</option>
                    <option value="debt">Борг</option>
                  </select>
                </label>
              </div>
            ) : null}
          </div>
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
          <button
            type="button"
            className={styles.primary}
            onClick={handleSave}
            disabled={saving || !name.trim() || parseMoney(amount) === null}
          >
            {saving ? `${t('addTx', 'save')}...` : isCreateMode ? t('addTx', 'create') : t('addTx', 'save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountEditSheet;
