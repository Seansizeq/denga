import type { TelegramWindow } from '../types/telegram';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const DEV_AUTH_BYPASS = import.meta.env.DEV;

const getTelegramInitData = (): string => {
  const tgWindow = window as Window & TelegramWindow;
  return tgWindow.Telegram?.WebApp?.initData ?? '';
};

const buildHeaders = (headers?: HeadersInit): Headers => {
  const out = new Headers(headers ?? {});
  const initData = getTelegramInitData();
  if (initData) out.set('x-telegram-init-data', initData);
  if (!initData && DEV_AUTH_BYPASS) out.set('x-telegram-init-data', 'dev-bypass');
  return out;
};

export const apiUrl = (path: string): string => `${API_URL}${path}`;

export const apiFetch = (path: string, init?: RequestInit): Promise<Response> =>
  fetch(apiUrl(path), {
    ...init,
    headers: buildHeaders(init?.headers),
  });
