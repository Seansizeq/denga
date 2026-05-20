import type { TelegramWindow } from '../types/telegram';

export const showAppAlert = (message: string): void => {
  const webApp = (window as TelegramWindow).Telegram?.WebApp;
  if (typeof webApp?.showAlert === 'function') {
    void webApp.showAlert(message);
    return;
  }
  window.alert(message);
};

export const hapticLight = (): void => {
  const h = (window as TelegramWindow).Telegram?.WebApp?.HapticFeedback;
  h?.impactOccurred?.('light');
};
