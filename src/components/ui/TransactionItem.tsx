import React from 'react';
import * as LucideIcons from 'lucide-react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Transaction } from '../../types';
import { findCategory, getCustomCategoryData, inferCustomCategoryIcon } from '../../constants/categories';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useTranslation } from '../../i18n/LanguageContext';
import type { CategoryKey } from '../../i18n/translations';
import { getAccountSlugFromNote, stripAccountFromNote } from '../../utils/transactionAccount';
import { getTransferSummaryLabel } from '../../utils/transactionUtils';
import { useDenominationRates } from '../../hooks/useDenominationRates';
import { useAccountNames } from '../../hooks/useAccountNames';
import { hapticResult, showAppConfirm } from '../../utils/notify';
import styles from './TransactionItem.module.css';

const iconRegistry = LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>>;

/** Скільки рядків з'являються каскадом — приблизно один екран. */
const ANIMATED_ROWS = 8;

interface TransactionItemProps {
  transaction: Transaction;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
  /** У згрупованих списках дату вже написано в заголовку дня. */
  showDate?: boolean;
  /** Порядковий номер у списку — задає крок каскаду появи. */
  index?: number;
}

const TransactionItem: React.FC<TransactionItemProps> = ({
  transaction,
  onDelete,
  onEdit,
  showDate = true,
  index = 0,
}) => {
  const { t, locale, displayCurrency } = useTranslation();
  const { convert } = useDenominationRates();
  const resolveAccountName = useAccountNames();
  const customCategory = getCustomCategoryData(transaction.categoryId);
  const category = customCategory
    ? findCategory(transaction.type === 'income' ? 'other_income' : 'other_expense')
    : findCategory(transaction.categoryId);
  const resolvedCustomIcon = customCategory ? inferCustomCategoryIcon(customCategory.name, customCategory.icon) : null;
  const IconComponent = customCategory
    ? (iconRegistry[resolvedCustomIcon ?? 'Tag'] ?? LucideIcons.Tag)
    : (iconRegistry[category.icon] ?? LucideIcons.Circle);

  const handleDelete = async () => {
    if (!onDelete) return;
    if (await showAppConfirm(t('history', 'deleteConfirm'))) {
      hapticResult('warning');
      onDelete(transaction.id);
    }
  };

  const handleEdit = () => {
    if (!onEdit) return;
    onEdit(transaction.id);
  };

  const categoryName = customCategory?.name ?? t('categories', category.id as CategoryKey);
  const cleanNote = stripAccountFromNote(transaction.note?.trim() ?? '');
  const isIncome = transaction.type === 'income';
  const isTransfer = transaction.type === 'transfer';

  // Рахунок — найкорисніше, що можна написати в цьому рядку, тож він іде
  // першим і для переказу, і для звичайної операції. Дата лишається тільки
  // там, де список не згрупований по днях.
  const accountSummary = isTransfer
    ? getTransferSummaryLabel(transaction, resolveAccountName)
    : resolveAccountName(getAccountSlugFromNote(transaction.note));
  const subtitle =
    [accountSummary, cleanNote, showDate ? formatDate(transaction.date, locale) : '']
      .filter(Boolean)
      .join(' · ');
  const txCurrency = transaction.currency;
  // Null when a crypto price is missing: the equivalent line is hidden rather
  // than showing a figure the app cannot actually stand behind.
  const displayAmount = convert(transaction.amount, txCurrency);
  const showEquivalent = txCurrency !== displayCurrency && displayAmount !== null;
  const destinationAmount =
    transaction.transferToAmount && transaction.transferToAmount > 0
      ? transaction.transferToAmount
      : transaction.amount;
  const destinationCurrency = transaction.transferToCurrency ?? txCurrency;
  // Дві сторони варто показувати лише тоді, коли вони справді різні: переказ
  // без конвертації — це одна сума, а не «1 300 zł → 1 300 zł».
  const transferConverts =
    destinationCurrency !== txCurrency || destinationAmount !== transaction.amount;
  const amountLabel = isTransfer
    ? transferConverts
      ? `${formatCurrency(transaction.amount, locale, txCurrency)} → ${formatCurrency(destinationAmount, locale, destinationCurrency)}`
      : formatCurrency(transaction.amount, locale, txCurrency)
    : `${isIncome ? '+' : '−'}${formatCurrency(transaction.amount, locale, txCurrency)}`;

  return (
    <div
      // Каскад лише для перших рядків: анімувати всю історію одночасно —
      // це десятки шарів на кожен кадр, з чого й береться смикання. Далі за
      // межами першого екрана анімація нічого не додає.
      className={`${styles.row} ${index < ANIMATED_ROWS ? 'motion-list-item' : ''} ${onEdit ? styles.rowTappable : ''}`}
      style={index < ANIMATED_ROWS ? { ['--i' as string]: index } : undefined}
      {...(onEdit
        ? {
            role: 'button' as const,
            tabIndex: 0,
            onClick: handleEdit,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleEdit();
              }
            },
          }
        : {})}
    >
      <div className={styles.iconCircle}>
        <IconComponent size={22} color={customCategory?.color ?? category.color} strokeWidth={2} />
      </div>

      <div className={styles.info}>
        <span className={styles.name}>{categoryName}</span>
        <span className={styles.subtitle}>{subtitle}</span>
      </div>

      <div className={styles.right}>
        <span
          className={`${styles.amount} ${isTransfer ? '' : isIncome ? styles.income : styles.expense}`}
        >
          {amountLabel}
          {!isTransfer && showEquivalent ? (
            <span className={styles.subtitle}>
              {` (${formatCurrency(displayAmount, locale, displayCurrency)})`}
            </span>
          ) : null}
        </span>
        {(onEdit || onDelete) ? (
          <div className={styles.actions}>
            {onEdit ? (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit();
                }}
                aria-label={t('history', 'edit')}
              >
                <Pencil size={16} />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete();
                }}
                aria-label={t('history', 'delete')}
              >
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TransactionItem;
