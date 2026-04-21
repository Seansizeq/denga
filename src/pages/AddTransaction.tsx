import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import CategoryGrid from '../components/ui/CategoryGrid';
import { createCustomCategoryId, getCustomCategoryName } from '../constants/categories';
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
  const [customCategory, setCustomCategory] = useState('');
  const [note, setNote] = useState('');

  const customCategories = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; lastUsedAt: string }>();
    for (const tx of transactions) {
      if (tx.type !== type) continue;
      const name = getCustomCategoryName(tx.categoryId);
      if (!name) continue;

      const existing = byId.get(tx.categoryId);
      if (!existing || tx.date > existing.lastUsedAt) {
        byId.set(tx.categoryId, { id: tx.categoryId, name, lastUsedAt: tx.date });
      }
    }

    return Array.from(byId.values())
      .sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : -1))
      .slice(0, 8)
      .map(({ id, name }) => ({ id, name }));
  }, [transactions, type]);

  const handleSave = () => {
    const numAmount = parseFloat(amount.replace(',', '.'));
    if (!numAmount || numAmount <= 0) return;
    const trimmedCustomCategory = customCategory.trim();

    addTransaction({
      amount: numAmount,
      type,
      categoryId: trimmedCustomCategory
        ? createCustomCategoryId(trimmedCustomCategory)
        : categoryId,
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
            setCustomCategory('');
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
            setCustomCategory('');
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
          onSelect={(id) => {
            setCategoryId(id);
            setCustomCategory(getCustomCategoryName(id) ?? '');
          }}
        />
        <input
          type="text"
          value={customCategory}
          onChange={(e) => {
            const value = e.target.value;
            setCustomCategory(value);
            if (value.trim()) {
              setCategoryId(createCustomCategoryId(value.trim()));
            } else if (getCustomCategoryName(categoryId)) {
              setCategoryId(type === 'income' ? 'salary' : 'food');
            }
          }}
          placeholder={t('addTx', 'customCategoryPlaceholder')}
          className={styles.customCategoryInput}
          maxLength={40}
        />
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
