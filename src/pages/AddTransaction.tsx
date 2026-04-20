import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTransactions } from '../context/TransactionContext';
import CategoryGrid from '../components/ui/CategoryGrid';
import type { TransactionType } from '../types';
import styles from './AddTransaction.module.css';

const AddTransaction: React.FC = () => {
  const navigate = useNavigate();
  const { addTransaction } = useTransactions();
  
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [categoryId, setCategoryId] = useState('food');

  const handleSave = () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) return;

    addTransaction({
      amount: numAmount,
      type,
      categoryId,
    });
    
    navigate('/');
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button type="button" onClick={() => navigate(-1)} className={styles.cancelBtn}>Скасувати</button>
        <h2 className={styles.title}>Додати</h2>
        <button type="button" onClick={handleSave} className={styles.saveBtn} disabled={!amount}>Зберегти</button>
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
          Витрата
        </button>
        <button 
          type="button"
          className={`${styles.typeBtn} ${type === 'income' ? styles.active : ''}`}
          onClick={() => {
            setType('income');
            setCategoryId('salary');
          }}
        >
          Дохід
        </button>
      </div>

      <div className={styles.amountContainer}>
        <input
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={styles.amountInput}
          autoFocus
        />
        <span className={styles.currency}>₴</span>
      </div>

      <section className={styles.categorySection}>
        <h3 className={styles.sectionTitle}>Категорія</h3>
        <CategoryGrid 
          type={type} 
          selectedId={categoryId} 
          onSelect={setCategoryId} 
        />
      </section>
    </div>
  );
};

export default AddTransaction;
