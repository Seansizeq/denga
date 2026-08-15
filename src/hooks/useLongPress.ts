import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_DELAY = 450;

interface LongPressHandlers {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}

/**
 * Довге натискання на елемент, який лишається звичайною кнопкою.
 *
 * Коротке торкання йде в `onClick`, утримання — в `onLongPress`. Після
 * спрацювання утримання клік гаситься: інакше палець, відпущений над кнопкою,
 * дав би обидві дії одразу.
 */
export const useLongPress = (
  onLongPress: () => void,
  onClick?: () => void,
  delay: number = DEFAULT_DELAY,
): LongPressHandlers => {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  return {
    onPointerDown: () => {
      firedRef.current = false;
      clear();
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        timerRef.current = null;
        onLongPress();
      }, delay);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    // Утримання на тачскріні інакше відкриває системне меню «копіювати».
    onContextMenu: (e) => e.preventDefault(),
    onClick: (e) => {
      if (firedRef.current) {
        firedRef.current = false;
        e.preventDefault();
        return;
      }
      onClick?.();
    },
  };
};
