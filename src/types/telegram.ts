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
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
}

export interface TelegramWindow {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
