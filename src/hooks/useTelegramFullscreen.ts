import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'denga_fullscreen';

interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const EMPTY: Inset = { top: 0, right: 0, bottom: 0, left: 0 };

const tg = () => (window as any)?.Telegram?.WebApp;

const writeInsets = () => {
  const w = tg();
  if (!w) return;
  const root = document.documentElement.style;

  const sa: Inset = w.safeAreaInset ?? EMPTY;
  const ca: Inset = w.contentSafeAreaInset ?? EMPTY;

  root.setProperty('--tg-safe-area-top', `${sa.top}px`);
  root.setProperty('--tg-safe-area-right', `${sa.right}px`);
  root.setProperty('--tg-safe-area-bottom', `${sa.bottom}px`);
  root.setProperty('--tg-safe-area-left', `${sa.left}px`);

  root.setProperty('--tg-content-safe-area-top', `${ca.top}px`);
  root.setProperty('--tg-content-safe-area-right', `${ca.right}px`);
  root.setProperty('--tg-content-safe-area-bottom', `${ca.bottom}px`);
  root.setProperty('--tg-content-safe-area-left', `${ca.left}px`);
};

const markBody = (on: boolean) => {
  const cls = 'tg-fullscreen';
  if (on) document.body.classList.add(cls);
  else document.body.classList.remove(cls);
};

export const useTelegramFullscreen = () => {
  const w = tg();
  const isSupported = !!w && typeof w.requestFullscreen === 'function';
  const [isFullscreen, setIsFullscreen] = useState<boolean>(!!w?.isFullscreen);

  const enter = useCallback(() => {
    const app = tg();
    if (!app || typeof app.requestFullscreen !== 'function') return;
    try {
      app.requestFullscreen();
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    } catch {
      /* ignore */
    }
  }, []);

  const exit = useCallback(() => {
    const app = tg();
    if (!app || typeof app.exitFullscreen !== 'function') return;
    try {
      app.exitFullscreen();
      try { localStorage.setItem(STORAGE_KEY, '0'); } catch { /* ignore */ }
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    const app = tg();
    if (!app) return;
    if (app.isFullscreen) exit();
    else enter();
  }, [enter, exit]);

  useEffect(() => {
    const app = tg();
    if (!app) return;

    writeInsets();
    markBody(!!app.isFullscreen);
    setIsFullscreen(!!app.isFullscreen);

    const onFullscreen = () => {
      setIsFullscreen(!!app.isFullscreen);
      markBody(!!app.isFullscreen);
      writeInsets();
    };
    const onInsets = () => writeInsets();

    app.onEvent?.('fullscreenChanged', onFullscreen);
    app.onEvent?.('fullscreenFailed', onFullscreen);
    app.onEvent?.('safeAreaChanged', onInsets);
    app.onEvent?.('contentSafeAreaChanged', onInsets);
    app.onEvent?.('viewportChanged', onInsets);

    return () => {
      app.offEvent?.('fullscreenChanged', onFullscreen);
      app.offEvent?.('fullscreenFailed', onFullscreen);
      app.offEvent?.('safeAreaChanged', onInsets);
      app.offEvent?.('contentSafeAreaChanged', onInsets);
      app.offEvent?.('viewportChanged', onInsets);
    };
  }, []);

  useEffect(() => {
    if (!isSupported) return;
    let pref: string | null = null;
    try { pref = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
    if (pref === '0') return;
    if (w?.isFullscreen) return;
    try { w?.requestFullscreen?.(); } catch { /* ignore */ }
  }, [isSupported, w]);

  return { isSupported, isFullscreen, enter, exit, toggle };
};
