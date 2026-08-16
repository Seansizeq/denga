import React, { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import { AccountIconGlyph, type AccountIconKey } from '../../utils/accountIcons';
import {
  DENOMINATIONS,
  isCryptoDenomination,
  normalizeDenomination,
  type Denomination,
} from '../../utils/denomination';
import { AccountRowAvatar } from './AccountRowAvatar';
import { showAppConfirm } from '../../utils/notify';
import FormSheet from './FormSheet';
import styles from './FormSheet.module.css';

export type EditableAccount = {
  accountKey: string;
  section: 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt';
  sortIndex: number;
  name: string;
  primaryAmount: number;
  /** The unit the balance is counted in — fiat currency or crypto asset. */
  primaryCurrency: Denomination;
  subText: string;
  iconTone: 'bank' | 'cash' | 'crypto' | 'stocks' | 'debt' | 'neutral';
  badge: string;
  /** Empty string = automatic icon from section / account key. */
  iconKey: string;
  debtDirection: 'owed_to_me' | 'owed_by_me' | null;
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

const COLOR_OPTIONS: Array<{
  tone: EditableAccount['iconTone'];
  labelKey: 'colorBank' | 'colorCash' | 'colorCrypto' | 'colorStocks' | 'colorDebt' | 'colorNeutral';
  swatch: string;
}> = [
  { tone: 'bank',    labelKey: 'colorBank',    swatch: '#ffb020' },
  { tone: 'cash',    labelKey: 'colorCash',    swatch: '#8f74ff' },
  { tone: 'crypto',  labelKey: 'colorCrypto',  swatch: '#58b7ff' },
  { tone: 'stocks',  labelKey: 'colorStocks',  swatch: '#4ade80' },
  { tone: 'debt',    labelKey: 'colorDebt',    swatch: '#ff6b6b' },
  { tone: 'neutral', labelKey: 'colorNeutral', swatch: '#73737c' },
];

/** Той самий колір, що й у кружечку вибору — картка вгорі форми ним заливається. */
const COLOR_BY_TONE: Record<EditableAccount['iconTone'], string> = {
  bank: '#ffb020',
  cash: '#8f74ff',
  crypto: '#58b7ff',
  stocks: '#4ade80',
  debt: '#ff6b6b',
  neutral: '#73737c',
};

const LUCIDE_PICKS: Array<{
  key: Exclude<AccountIconKey, 'auto'>;
  labelKey:
    | 'iconCard' | 'iconBank' | 'iconWallet' | 'iconCash' | 'iconSavings'
    | 'iconCrypto' | 'iconStocks' | 'iconStable' | 'iconDebt';
}> = [
  { key: 'CreditCard',       labelKey: 'iconCard'    },
  { key: 'Landmark',         labelKey: 'iconBank'    },
  { key: 'Wallet',           labelKey: 'iconWallet'  },
  { key: 'Banknote',         labelKey: 'iconCash'    },
  { key: 'PiggyBank',        labelKey: 'iconSavings' },
  { key: 'Coins',            labelKey: 'iconCrypto'  },
  { key: 'TrendingUp',       labelKey: 'iconStocks'  },
  { key: 'CircleDollarSign', labelKey: 'iconStable'  },
  { key: 'HandCoins',        labelKey: 'iconDebt'    },
];

/** Розділи звуться так само, як у гаманці й у пікері типу рахунку. */
const SECTION_LABEL_KEYS: Record<
  EditableAccount['section'],
  'sectionBank' | 'sectionCash' | 'sectionCrypto' | 'sectionStocks' | 'sectionDebt'
> = {
  bank:   'sectionBank',
  cash:   'sectionCash',
  crypto: 'sectionCrypto',
  stocks: 'sectionStocks',
  debt:   'sectionDebt',
};

const SECTION_PLACEHOLDER_KEYS: Record<
  EditableAccount['section'],
  'placeholderBank' | 'placeholderCash' | 'placeholderCrypto' | 'placeholderStocks' | 'placeholderDebt'
> = {
  bank:   'placeholderBank',
  cash:   'placeholderCash',
  crypto: 'placeholderCrypto',
  stocks: 'placeholderStocks',
  debt:   'placeholderDebt',
};

const AccountEditSheet: React.FC<AccountEditSheetProps> = ({ initial, onClose, onSave, onDelete }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(() => initial.name);
  const [amount, setAmount] = useState(() => String(initial.primaryAmount));
  const [currency, setCurrency] = useState<Denomination>(() => normalizeDenomination(initial.primaryCurrency));
  const [section, setSection] = useState<EditableAccount['section']>(() => initial.section);
  const [iconKey, setIconKey] = useState(() => (initial.iconKey ?? '').trim());
  const [debtDirection, setDebtDirection] = useState<'owed_to_me' | 'owed_by_me'>(
    () => (initial.debtDirection === 'owed_by_me' ? 'owed_by_me' : 'owed_to_me'),
  );
  const [iconTone, setIconTone] = useState<EditableAccount['iconTone']>(() => initial.iconTone);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isCreateMode = useMemo(() => !initial.accountKey.trim(), [initial.accountKey]);

  const previewAccountKey = useMemo(() => {
    const k = initial.accountKey.trim();
    if (k) return k;
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return slug || 'account';
  }, [initial.accountKey, name]);

  // The denomination is the coin: no second place to state it, so the two
  // can no longer disagree.
  const previewCryptoSymbol = useMemo(
    () => (isCryptoDenomination(currency) ? currency : null),
    [currency],
  );

  const handleSave = async () => {
    const n = parseMoney(amount);
    if (!name.trim() || n === null) return;
    setError('');
    setSaving(true);
    try {
      // sub_text is a free-form note again; the position lives in the balance.
      const builtSubText = initial.subText;
      await onSave({
        ...initial,
        section,
        name: name.trim(),
        primaryAmount: n,
        primaryCurrency: currency,
        subText: builtSubText,
        badge: initial.badge,
        iconKey: iconKey.trim(),
        debtDirection: section === 'debt' ? debtDirection : null,
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
    const confirmMessage =
      initial.section === 'debt' && initial.primaryAmount > 0
        ? t('balance', 'debtDeleteConfirmWithBalance')
        : t('addTx', 'deleteConfirm');
    const ok = await showAppConfirm(confirmMessage);
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

  const canSave = Boolean(name.trim()) && parseMoney(amount) !== null && !saving;

  return (
    <FormSheet
      title={t('balance', isCreateMode ? 'accountNewTitle' : 'accountEditTitle')}
      onClose={onClose}
      onSubmit={() => void handleSave()}
      submitLabel={isCreateMode ? t('addTx', 'create') : t('addTx', 'save')}
      cancelLabel={t('addTx', 'cancel')}
      submitDisabled={!canSave}
      error={error || undefined}
    >
      <div className={styles.heroCard} style={{ background: COLOR_BY_TONE[iconTone] }}>
        <AccountRowAvatar
          accountKey={previewAccountKey}
          iconTone={iconTone}
          section={section}
          iconKey={iconKey || null}
          cryptoSymbol={previewCryptoSymbol}
          glyphSize={24}
        />
        <div className={styles.heroInfo}>
          <span className={styles.heroName}>{name.trim() || t('balance', 'accountNewTitle')}</span>
          <span className={styles.heroCaption}>{t('balance', SECTION_LABEL_KEYS[section])}</span>
        </div>
      </div>

      <div className={styles.group}>
        <label className={styles.row}>
          <span className={styles.rowLabel}>{t('accountEditor', 'fieldName')}</span>
          <input
            className={styles.rowField}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder={t('accountEditor', SECTION_PLACEHOLDER_KEYS[section])}
            autoFocus={isCreateMode}
          />
        </label>

        <label className={styles.row}>
          <span className={styles.rowLabel}>{t('accountEditor', 'fieldAmount')}</span>
          <input
            className={styles.rowField}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
        </label>

        <label className={styles.row}>
          <span className={styles.rowLabel}>{t('accountEditor', 'fieldCurrency')}</span>
          <select
            className={`${styles.rowField} ${styles.rowSelect}`}
            value={currency}
            onChange={(e) => setCurrency(normalizeDenomination(e.target.value))}
          >
            {DENOMINATIONS.map((code) => (
              <option key={code} value={code}>
                {code === 'UAH' ? 'UAH (₴)' : code === 'PLN' ? 'PLN (zł)' : code === 'USD' ? 'USD ($)' : code}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.row}>
          <span className={styles.rowLabel}>{t('accountEditor', 'fieldSection')}</span>
          <select
            className={`${styles.rowField} ${styles.rowSelect}`}
            value={section}
            onChange={(e) => setSection(e.target.value as EditableAccount['section'])}
          >
            {(Object.keys(SECTION_LABEL_KEYS) as Array<EditableAccount['section']>).map((key) => (
              <option key={key} value={key}>{t('balance', SECTION_LABEL_KEYS[key])}</option>
            ))}
          </select>
        </label>
      </div>

      {section === 'debt' ? (
        <div className={styles.segment} role="group" aria-label={t('balance', 'debtDirectionLabel')}>
          <button
            type="button"
            className={styles.segmentBtn}
            aria-pressed={debtDirection === 'owed_to_me'}
            onClick={() => setDebtDirection('owed_to_me')}
          >
            {t('balance', 'debtDirectionOwedToMe')}
          </button>
          <button
            type="button"
            className={styles.segmentBtn}
            aria-pressed={debtDirection === 'owed_by_me'}
            onClick={() => setDebtDirection('owed_by_me')}
          >
            {t('balance', 'debtDirectionOwedByMe')}
          </button>
        </div>
      ) : null}

      <div>
        <p className={styles.blockLabel}>{t('balance', 'accountColorLabel')}</p>
        <div className={styles.colorRow}>
          {COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.tone}
              type="button"
              className={`${styles.colorDot} ${iconTone === opt.tone ? styles.colorDotActive : ''}`}
              style={{ backgroundColor: opt.swatch }}
              onClick={() => setIconTone(opt.tone)}
              aria-label={t('accountEditor', opt.labelKey)}
              title={t('accountEditor', opt.labelKey)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className={styles.blockLabel}>{t('balance', 'accountIconLabel')}</p>
        <div className={styles.iconGrid}>
          <button
            type="button"
            className={`${styles.iconOption} ${!iconKey ? styles.iconOptionActive : ''}`}
            onClick={() => setIconKey('')}
            aria-pressed={!iconKey}
            title={t('accountEditor', 'iconAuto')}
          >
            <Sparkles size={20} strokeWidth={2.2} />
          </button>
          {LUCIDE_PICKS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`${styles.iconOption} ${iconKey === opt.key ? styles.iconOptionActive : ''}`}
              onClick={() => setIconKey(opt.key)}
              aria-pressed={iconKey === opt.key}
              title={t('accountEditor', opt.labelKey)}
            >
              <AccountIconGlyph iconKey={opt.key} size={20} strokeWidth={2.2} />
            </button>
          ))}
        </div>
      </div>

      {!isCreateMode && onDelete ? (
        <button
          type="button"
          className={styles.deleteRow}
          onClick={() => void handleDelete()}
          disabled={saving}
        >
          {t('history', 'delete')}
        </button>
      ) : null}
    </FormSheet>
  );
};

export default AccountEditSheet;
