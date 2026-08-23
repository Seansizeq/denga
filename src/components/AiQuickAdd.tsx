import { useState, type FormEvent } from 'react';
import { ArrowUp, LoaderCircle, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { parseAiTransaction, type AiPreviewError } from '../api/client';
import { useTranslation } from '../i18n/LanguageContext';
import { hapticResult } from '../utils/notify';
import styles from './AiQuickAdd.module.css';

const AiQuickAdd = () => {
  const navigate = useNavigate();
  const { t, displayCurrency } = useTranslation();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = text.trim();
    if (!message || loading) return;

    setLoading(true);
    setError('');
    try {
      const preview = await parseAiTransaction(message, displayCurrency);
      const params = new URLSearchParams({
        type: preview.type,
        amount: String(preview.amount),
        currency: preview.currency,
        categoryId: preview.categoryId,
        date: preview.date,
        note: preview.note,
      });
      if (preview.accountKey) params.set('account', preview.accountKey);
      hapticResult('success');
      navigate(`/add?${params.toString()}`);
    } catch (caught) {
      hapticResult('error');
      const err = caught as AiPreviewError;
      setError(
        err.code === 'NOT_RECOGNIZED' || err.code === 'INVALID_TEXT'
          ? t('dashboard', 'aiNotRecognized')
          : t('dashboard', 'aiUnavailable'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="ai-quick-add-title">
      <div className={styles.heading}>
        <span className={styles.icon} aria-hidden="true">
          <Sparkles size={18} strokeWidth={1.8} />
        </span>
        <div>
          <h2 className={styles.title} id="ai-quick-add-title">
            {t('dashboard', 'aiTitle')}
          </h2>
          <p className={styles.hint}>{t('dashboard', 'aiHint')}</p>
        </div>
      </div>

      <form className={styles.form} onSubmit={submit}>
        <input
          className={styles.input}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (error) setError('');
          }}
          placeholder={t('dashboard', 'aiPlaceholder')}
          aria-label={t('dashboard', 'aiPlaceholder')}
          maxLength={500}
          enterKeyHint="send"
          disabled={loading}
        />
        <button
          className={styles.submit}
          type="submit"
          disabled={!text.trim() || loading}
          aria-label={loading ? t('dashboard', 'aiLoading') : t('dashboard', 'aiSubmit')}
        >
          {loading ? (
            <LoaderCircle className={styles.spinner} size={18} aria-hidden="true" />
          ) : (
            <ArrowUp size={19} strokeWidth={2.4} aria-hidden="true" />
          )}
        </button>
      </form>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
};

export default AiQuickAdd;
