import { useEffect } from 'react';

/**
 * Періодичне оновлення, яке засинає разом із застосунком: поки вкладку
 * згорнуто, запитів немає, а при поверненні одразу робиться свіжий запит.
 * Раніше кожен опитувач молотив увесь час, навіть у фоні.
 */
export const usePolling = (tick: () => void | Promise<void>, intervalMs: number): void => {
  useEffect(() => {
    let timerId: number | undefined;

    const run = () => {
      void tick();
    };

    const start = () => {
      if (timerId !== undefined) return;
      timerId = window.setInterval(run, intervalMs);
    };

    const stop = () => {
      if (timerId === undefined) return;
      window.clearInterval(timerId);
      timerId = undefined;
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
        return;
      }
      run();
      start();
    };

    run();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [tick, intervalMs]);
};
