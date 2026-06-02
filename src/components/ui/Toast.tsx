import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, AlertCircle } from 'lucide-react';
import styles from './Toast.module.css';

type ToastVariant = 'success' | 'error';

type ToastState = {
  id: number;
  message: string;
  variant: ToastVariant;
};

interface ToastContextValue {
  show: (message: string, options?: { variant?: ToastVariant }) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const AUTO_DISMISS_MS = 2200;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<number | null>(null);

  const show = useCallback<ToastContextValue['show']>((message, options) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    setToast({ id: Date.now(), message, variant: options?.variant ?? 'success' });
    timerRef.current = window.setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, AUTO_DISMISS_MS);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast
        ? createPortal(
            <div className={styles.viewport} role="status" aria-live="polite">
              <div className={`${styles.toast} ${toast.variant === 'error' ? styles.error : styles.success}`}>
                <span className={styles.icon}>
                  {toast.variant === 'error' ? (
                    <AlertCircle size={16} strokeWidth={2.5} />
                  ) : (
                    <Check size={16} strokeWidth={2.5} />
                  )}
                </span>
                <span className={styles.message}>{toast.message}</span>
              </div>
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
};
