import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { X } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import CategoryGrid from '../components/ui/CategoryGrid';
import {
  createCustomCategoryId,
  CUSTOM_CATEGORY_COLORS,
  CUSTOM_CATEGORY_ICONS,
  type CustomCategoryIcon,
} from '../constants/categories';
import { useTranslation } from '../i18n/LanguageContext';
import type { TransactionType } from '../types';
import styles from './AddTransaction.module.css';

const AddTransaction: React.FC = () => {
  const navigate = useNavigate();
  const { transactions, addTransaction, updateTransaction } = useTransactions();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit')?.trim() ?? '';
  const editingTransaction = editId ? transactions.find((tx) => tx.id === editId) : undefined;
  const isEditing = Boolean(editId);

  const initialType: TransactionType =
    editingTransaction?.type ?? (searchParams.get('type') === 'income' ? 'income' : 'expense');

  const [amount, setAmount] = useState(() => (editingTransaction ? String(editingTransaction.amount) : ''));
  const [type, setType] = useState<TransactionType>(initialType);
  const [categoryId, setCategoryId] = useState(() => (
    editingTransaction?.categoryId ?? (initialType === 'income' ? 'salary' : 'food')
  ));
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState<CustomCategoryIcon>('Tag');
  const [newCategoryColor, setNewCategoryColor] = useState('#8E8E93');
  const [note, setNote] = useState(() => editingTransaction?.note ?? '');
  const [customCategories, setCustomCategories] = useState<
    Array<{ id: string; name: string; icon: string; color: string }>
  >([]);
  const [creatingCategory, setCreatingCategory] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL ?? '';

  useEffect(() => {
    let cancelled = false;
    const loadCustomCategories = async () => {
      try {
        const response = await fetch(`${API_URL}/api/custom-categories?type=${type}`);
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && Array.isArray(data)) {
          setCustomCategories(data);
        }
      } catch (error) {
        console.error('Error fetching custom categories:', error);
      }
    };
    loadCustomCategories();
    return () => {
      cancelled = true;
    };
  }, [API_URL, type]);

  const canCreateCustomCategory = newCategoryName.trim().length > 0;

  const handleSave = async () => {
    const numAmount = parseFloat(amount.replace(',', '.'));
    if (!numAmount || numAmount <= 0) return;
    const payload = {
      amount: numAmount,
      type,
      categoryId,
      note: note.trim() || undefined,
    };
    if (isEditing && editId) {
      await updateTransaction(editId, payload);
    } else {
      await addTransaction(payload);
    }

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
        <h2 className={styles.title}>{isEditing ? t('addTx', 'editTitle') : t('addTx', 'title')}</h2>
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
            setIsCreatingCustom(true);
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
                disabled={!canCreateCustomCategory || creatingCategory}
                onClick={async () => {
                  if (!canCreateCustomCategory || creatingCategory) return;
                  setCreatingCategory(true);
                  const cleanName = newCategoryName.trim().replace(/\s+/g, ' ');
                  const fallbackId = createCustomCategoryId(
                    cleanName,
                    newCategoryIcon,
                    newCategoryColor
                  );
                  try {
                    const response = await fetch(`${API_URL}/api/custom-categories`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: cleanName,
                        icon: newCategoryIcon,
                        color: newCategoryColor,
                        type,
                      }),
                    });
                    const saved = response.ok ? await response.json() : null;
                    const nextId = saved?.id ?? fallbackId;
                    setCategoryId(nextId);
                    setCustomCategories((prev) => {
                      const exists = prev.some((c) => c.id === nextId);
                      if (exists) return prev;
                      return [
                        {
                          id: nextId,
                          name: saved?.name ?? cleanName,
                          icon: saved?.icon ?? newCategoryIcon,
                          color: saved?.color ?? newCategoryColor,
                        },
                        ...prev,
                      ];
                    });
                  } catch (error) {
                    console.error('Error creating custom category:', error);
                    setCategoryId(fallbackId);
                  }
                  setNewCategoryName('');
                  setNewCategoryIcon('Tag');
                  setNewCategoryColor('#8E8E93');
                  setIsCreatingCustom(false);
                  setCreatingCategory(false);
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
          {isEditing ? t('addTx', 'saveChanges') : t('addTx', 'save')}
        </button>
      </div>
    </div>
  );
};

export default AddTransaction;
