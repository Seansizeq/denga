import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { X } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import CategoryGrid from '../components/ui/CategoryGrid';
import {
  createCustomCategoryId,
  CUSTOM_CATEGORY_COLORS,
  CUSTOM_CATEGORY_ICONS,
  getCustomCategoryData,
  type CustomCategoryIcon,
} from '../constants/categories';
import { useTranslation } from '../i18n/LanguageContext';
import type { TransactionType } from '../types';
import styles from './AddTransaction.module.css';

const AddTransaction: React.FC = () => {
  const navigate = useNavigate();
  const { addTransaction, transactions } = useTransactions();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const initialType: TransactionType =
    searchParams.get('type') === 'income' ? 'income' : 'expense';

  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>(initialType);
  const [categoryId, setCategoryId] = useState(initialType === 'income' ? 'salary' : 'food');
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState<CustomCategoryIcon>('Tag');
  const [newCategoryColor, setNewCategoryColor] = useState('#8E8E93');
  const [note, setNote] = useState('');

  const customCategories = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; name: string; icon: string; color: string; lastUsedAt: string }
    >();
    for (const tx of transactions) {
      if (tx.type !== type) continue;
      const customData = getCustomCategoryData(tx.categoryId);
      if (!customData) continue;

      const existing = byId.get(tx.categoryId);
      if (!existing || tx.date > existing.lastUsedAt) {
        byId.set(tx.categoryId, {
          id: tx.categoryId,
          name: customData.name,
          icon: customData.icon,
          color: customData.color,
          lastUsedAt: tx.date,
        });
      }
    }

    return Array.from(byId.values())
      .sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : -1))
      .slice(0, 8)
      .map(({ id, name, icon, color }) => ({ id, name, icon, color }));
  }, [transactions, type]);

  const canCreateCustomCategory = newCategoryName.trim().length > 0;

  const handleSave = () => {
    const numAmount = parseFloat(amount.replace(',', '.'));
    if (!numAmount || numAmount <= 0) return;
    addTransaction({
      amount: numAmount,
      type,
      categoryId,
      note: note.trim() || undefined,
    });

    navigate('/');
  };

  const isValid = !!amount && parseFloat(amount.replace(',', '.')) > 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className={styles.closeBtn}
          aria-label={t('addTx', 'cancel')}
        >
          <X size={20} strokeWidth={2.5} />
        </button>
        <h2 className={styles.title}>{t('addTx', 'title')}</h2>
        <span className={styles.headerSpacer} aria-hidden="true" />
      </header>

      <div className={styles.typeSelector}>
        <button
          type="button"
          className={`${styles.typeBtn} ${type === 'expense' ? styles.active : ''}`}
          onClick={() => {
            setType('expense');
            setCategoryId('food');
            setIsCreatingCustom(false);
          }}
        >
          {t('addTx', 'expense')}
        </button>
        <button
          type="button"
          className={`${styles.typeBtn} ${type === 'income' ? styles.active : ''}`}
          onClick={() => {
            setType('income');
            setCategoryId('salary');
            setIsCreatingCustom(false);
          }}
        >
          {t('addTx', 'income')}
        </button>
      </div>

      <div className={styles.amountContainer}>
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.,]?[0-9]*"
          placeholder={t('addTx', 'amountPlaceholder')}
          value={amount}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.,]/g, '');
            setAmount(v);
          }}
          className={styles.amountInput}
          autoFocus
        />
        <span className={styles.currency}>₴</span>
      </div>

      <section className={styles.categorySection}>
        <h3 className={styles.sectionTitle}>{t('addTx', 'category')}</h3>
        <CategoryGrid
          type={type}
          selectedId={categoryId}
          customCategories={customCategories}
          onAddCustom={() => {
            setIsCreatingCustom((prev) => !prev);
          }}
          onSelect={(id) => {
            setCategoryId(id);
            setIsCreatingCustom(false);
          }}
        />
        {isCreatingCustom ? (
          <div className={styles.customCategoryCard}>
            <h4 className={styles.customCategoryTitle}>{t('addTx', 'createCategory')}</h4>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder={t('addTx', 'customCategoryPlaceholder')}
              className={styles.customCategoryInput}
              maxLength={40}
            />
            <p className={styles.iconPickerLabel}>{t('addTx', 'chooseIcon')}</p>
            <div className={styles.iconPickerGrid}>
              {CUSTOM_CATEGORY_ICONS.map((iconName) => {
                const IconComponent = (LucideIcons as any)[iconName] ?? LucideIcons.Tag;
                const selected = newCategoryIcon === iconName;
                return (
                  <button
                    key={iconName}
                    type="button"
                    className={`${styles.iconPickBtn} ${selected ? styles.iconPickBtnSelected : ''}`}
                    onClick={() => setNewCategoryIcon(iconName)}
                  >
                    <IconComponent size={20} strokeWidth={1.8} />
                  </button>
                );
              })}
            </div>
            <p className={styles.iconPickerLabel}>{t('addTx', 'chooseColor')}</p>
            <div className={styles.colorPickerGrid}>
              {CUSTOM_CATEGORY_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.colorPickBtn} ${newCategoryColor === color ? styles.colorPickBtnSelected : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setNewCategoryColor(color)}
                />
              ))}
            </div>
            <div className={styles.customCategoryActions}>
              <button
                type="button"
                className={styles.customCategoryCancelBtn}
                onClick={() => setIsCreatingCustom(false)}
              >
                {t('addTx', 'cancel')}
              </button>
              <button
                type="button"
                className={styles.customCategoryCreateBtn}
                disabled={!canCreateCustomCategory}
                onClick={() => {
                  const id = createCustomCategoryId(
                    newCategoryName.trim(),
                    newCategoryIcon,
                    newCategoryColor
                  );
                  setCategoryId(id);
                  setNewCategoryName('');
                  setNewCategoryIcon('Tag');
                  setNewCategoryColor('#8E8E93');
                  setIsCreatingCustom(false);
                }}
              >
                {t('addTx', 'create')}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className={styles.noteSection}>
        <h3 className={styles.sectionTitle}>{t('addTx', 'note')}</h3>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('addTx', 'notePlaceholder')}
          className={styles.noteInput}
          maxLength={80}
        />
      </section>

      <div className={styles.saveBarSpacer} aria-hidden="true" />

      <div className={styles.saveBar}>
        <button
          type="button"
          onClick={handleSave}
          className={styles.saveBtn}
          disabled={!isValid}
        >
          {t('addTx', 'save')}
        </button>
      </div>
    </div>
  );
};

export default AddTransaction;
