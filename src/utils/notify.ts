import type { TelegramWindow } from '../types/telegram';

const webApp = () => (window as TelegramWindow).Telegram?.WebApp;

export const showAppAlert = (message: string): void => {
  const app = webApp();
  if (typeof app?.showAlert === 'function') {
    void app.showAlert(message);
    return;
  }
  window.alert(message);
};

/**
 * Підтвердження нативним діалогом Telegram. `window.confirm` у WebView
 * поводиться по-різному на різних клієнтах, тож він лишається тільки як
 * запасний варіант поза Telegram.
 */
export const showAppConfirm = (message: string): Promise<boolean> => {
  const app = webApp();
  if (typeof app?.showConfirm === 'function') {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      try {
        const maybePromise = app.showConfirm!(message, (confirmed) => finish(Boolean(confirmed)));
        if (maybePromise && typeof (maybePromise as Promise<boolean>).then === 'function') {
          void (maybePromise as Promise<boolean>).then((confirmed) => finish(Boolean(confirmed)));
        }
      } catch {
        finish(window.confirm(message));
      }
    });
  }
  return Promise.resolve(window.confirm(message));
};

export const hapticLight = (): void => {
  webApp()?.HapticFeedback?.impactOccurred?.('light');
};

/** Відчутний відгук на завершену дію: збереження, видалення, помилка. */
export const hapticResult = (type: 'success' | 'warning' | 'error'): void => {
  webApp()?.HapticFeedback?.notificationOccurred?.(type);
};
