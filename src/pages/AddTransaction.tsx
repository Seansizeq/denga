import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTransactions } from '../context/TransactionContext';
import CategoryGrid from '../components/ui/CategoryGrid';
import { useTranslation } from '../i18n/LanguageContext';
import type { TransactionType } from '../types';
import styles from './AddTransaction.module.css';

const AddTransaction: React.FC = () => {
  const navigate = useNavigate();
  const { addTransaction } = useTransactions();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const initialType: TransactionType =
    searchParams.get('type') === 'income' ? 'income' : 'expense';

  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>(initialType);
  const [categoryId, setCategoryId] = useState(initialType === 'income' ? 'salary' : 'food');
  const [note, setNote] = useState('');

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
          className={styles.cancelBtn}
        >
          {t('addTx', 'cancel')}
        </button>
        <h2 className={styles.title}>{t('addTx', 'title')}</h2>
        <button
          type="button"
          onClick={handleSave}
          className={styles.saveBtn}
          disabled={!isValid}
        >
          {t('addTx', 'save')}
        </button>
      </header>

      <div className={styles.typeSelector}>
        <button
          type="button"
          className={`${styles.typeBtn} ${type === 'expense' ? styles.active : ''}`}
          onClick={() => {
            setType('expense');
            setCategoryId('food');
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
          style={{ width: amount ? `${Math.max(1, amount.length)}ch` : '1ch' }}
          autoFocus
        />
        <span className={styles.currency}>₴</span>
      </div>

      <section className={styles.categorySection}>
        <h3 className={styles.sectionTitle}>{t('addTx', 'category')}</h3>
        <CategoryGrid
          type={type}
          selectedId={categoryId}
          onSelect={setCategoryId}
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
    </div>
  );
};

export default AddTransaction;
