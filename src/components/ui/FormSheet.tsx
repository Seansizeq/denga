import React, { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './FormSheet.module.css';

interface FormSheetProps {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  cancelLabel: string;
  submitDisabled?: boolean;
  /** Повідомлення про помилку над вмістом форми. */
  error?: string;
  children: React.ReactNode;
}

/**
 * Форма-шит у стилі iOS: «Скасувати — заголовок — Зберегти» вгорі, згрупований
 * список полів усередині.
 *
 * Стилі полів живуть у `FormSheet.module.css` і імпортуються формами напряму —
 * так кожна форма збирає свої рядки, але всі вони виглядають однаково.
 */
const FormSheet: React.FC<FormSheetProps> = ({
  title,
  onClose,
  onSubmit,
  submitLabel,
  cancelLabel,
  submitDisabled = false,
  error,
  children,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* Сторінка під шитом не має прокручуватись разом із ним. */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /**
   * Telegram сам зменшує вікно під клавіатуру, тож шит уже стоїть над нею —
   * лишається дотягнути поле, на яке щойно натиснули, у видиму частину.
   */
  const scrollFieldIntoView = useCallback((e: React.FocusEvent) => {
    const field = e.target;
    if (!(field instanceof HTMLElement)) return;
    // Із затримкою: до кінця анімації клавіатури висота ще змінюється.
    window.setTimeout(() => field.scrollIntoView({ block: 'nearest' }), 300);
  }, []);

  return createPortal(
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.grabber} aria-hidden="true" />
        <header className={styles.header}>
          <button
            type="button"
            className={`${styles.headerPill} ${styles.headerPillGhost}`}
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={`${styles.headerPill} ${styles.headerPillPrimary}`}
            disabled={submitDisabled}
            onClick={onSubmit}
          >
            {submitLabel}
          </button>
        </header>

        <div className={styles.body} onFocus={scrollFieldIntoView}>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          {children}
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default FormSheet;
