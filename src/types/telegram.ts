export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface TelegramWebApp {
  initData?: string;
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
  };
  safeAreaInset?: { top: number; right: number; bottom: number; left: number };
  contentSafeAreaInset?: { top: number; right: number; bottom: number; left: number };
  isFullscreen?: boolean;
  expand?: () => void;
  ready?: () => void;
  disableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  version?: string;
  showAlert?: (message: string, callback?: () => void) => Promise<void> | void;
  showConfirm?: (message: string, callback?: (confirmed: boolean) => void) => Promise<boolean> | void;
  isVersionAtLeast?: (version: string) => boolean;
  BackButton?: {
    isVisible?: boolean;
    show?: () => void;
    hide?: () => void;
    onClick?: (cb: () => void) => void;
    offClick?: (cb: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
  };
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
}

export interface TelegramWindow {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
