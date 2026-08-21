import React from 'react';
import { EyeOff } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useLongPress } from '../../hooks/useLongPress';
import { formatCurrency, type DisplayCurrency } from '../../utils/formatters';
import { SHORT_MASK } from '../../utils/moneyPrivacy';
import { hapticLight } from '../../utils/notify';
import styles from './HeroBalance.module.css';

interface HeroBalanceProps {
  net: number;
  income: number;
  expense: number;
  onOpenDetails?: () => void;
  locale?: string;
  /** Сума з рахунків (портфель), а не «усі доходи − витрати» */
  wealthMode?: boolean;
  /** В яких одиницях `net` (для коректних ₴ / zł) */
  mainAmountCurrency?: DisplayCurrency;
  /** Додатково показати залишок в іншій валюті, якщо > 0 */
  wealthOther?: { amount: number; currency: 'UAH' | 'PLN' };
  /** Зміна портфеля за ~30 днів, %; null — не показувати */
  wealthMonthChangePct?: number | null;
  /** Підказка «натисніть на суму…»; на головній часто вимкнено */
  showTapHint?: boolean;
}

const HeroBalance: React.FC<HeroBalanceProps> = ({
  net,
  income,
  expense,
  onOpenDetails,
  locale: localeProp,
  wealthMode = false,
  mainAmountCurrency = 'UAH',
  wealthOther,
  wealthMonthChangePct = null,
  showTapHint = true,
}) => {
  const { locale, t, displayCurrency, moneyHidden, toggleMoneyHidden } = useTranslation();
  const lc = localeProp || locale;

  const mainFormat: DisplayCurrency = wealthMode
    ? mainAmountCurrency
    : displayCurrency;

  // Знак і відсотки — теж дані про баланс, тож ховаються разом із сумами.
  const sign = !moneyHidden && net < 0 ? '−' : '';
  const ratio = income > 0 ? (net / income) * 100 : 0;
  const ratioStr = moneyHidden
    ? `${SHORT_MASK}%`
    : `${ratio >= 0 ? '+' : '−'}${Math.abs(ratio).toFixed(2)}%`;

  const longPress = useLongPress(() => {
    hapticLight();
    toggleMoneyHidden();
  }, onOpenDetails);

  const amountText = `${sign}${formatCurrency(Math.abs(net), lc, mainFormat)}`;

  const otherFormat: DisplayCurrency = wealthOther?.currency === 'PLN' ? 'PLN' : 'UAH';

  const formatWealthMonthPct = (pct: number) => {
    if (moneyHidden) return `${SHORT_MASK}%`;
    const abs = Math.abs(pct);
    const body = abs.toLocaleString(lc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (pct > 0) return `+${body}%`;
    if (pct < 0) return `−${body}%`;
    return `${body}%`;
  };

  return (
    <div className={styles.hero}>
      <div className={styles.amountRow}>
        {/* Тап — деталі рахунків, утримання — сховати/показати суми. */}
        <button
          type="button"
          className={styles.amountButton}
          aria-label={t('settings', moneyHidden ? 'showMoney' : 'hideMoney')}
          {...longPress}
        >
          <h1
            className={styles.amount}
            /* Довжина рядка керує кеглем — див. `.amount` у стилях. */
            style={{ ['--amount-len' as string]: amountText.length }}
          >
            {amountText}
            {moneyHidden ? (
              <EyeOff className={styles.hiddenMark} size={20} strokeWidth={2} aria-hidden="true" />
            ) : null}
          </h1>
        </button>
      </div>
      {wealthMode &&
      wealthMonthChangePct != null &&
      Number.isFinite(wealthMonthChangePct) ? (
        <div className={styles.monthChangeRow}>
          <span
            className={`${styles.monthChangePill} ${
              moneyHidden
                ? styles.neutralPill
                : wealthMonthChangePct >= 0
                  ? styles.positivePill
                  : styles.negativePill
            }`}
          >
            {formatWealthMonthPct(wealthMonthChangePct)}
          </span>
          <span className={styles.monthChangeHint}>{t('balance', 'monthChangeHint')}</span>
        </div>
      ) : null}
      {showTapHint ? <p className={styles.tapHint}>{t('balance', 'tapHint')}</p> : null}

      {wealthMode && wealthOther && wealthOther.amount > 0 ? (
        <div className={styles.deltaRow}>
          <span className={styles.wealthOther}>
            {formatCurrency(wealthOther.amount, lc, otherFormat)}
          </span>
        </div>
      ) : null}

      {!wealthMode ? (
        <div className={styles.deltaRow}>
          {income > 0 && (
            <span className={`${styles.delta} ${styles.income}`}>
              +{formatCurrency(Math.abs(income), lc, displayCurrency)}
            </span>
          )}
          {expense > 0 && (
            <span className={`${styles.deltaPill} ${styles.expensePill}`}>
              −{formatCurrency(Math.abs(expense), lc, displayCurrency)}
            </span>
          )}
          {income > 0 && (
            <span
              className={`${styles.deltaPill} ${
                moneyHidden ? styles.neutralPill : ratio >= 0 ? styles.positivePill : styles.negativePill
              }`}
            >
              {ratioStr}
            </span>
          )}
        </div>
      ) : null}

    </div>
  );
};

export default HeroBalance;
