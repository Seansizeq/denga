import { useEffect, useState } from 'react';

/** Менші перекриття — це панелі браузера, а не клавіатура. */
const KEYBOARD_MIN_HEIGHT = 72;

/**
 * Скільки пікселів знизу перекриває екранна клавіатура.
 *
 * На iOS (а Telegram Mini App — це WKWebView) клавіатура не зменшує layout
 * viewport: елемент з `position: fixed` лишається прикріпленим до низу
 * сторінки і наполовину ховається під клавіатурою. Справжню висоту видимої
 * області знає тільки `visualViewport`, тож рахуємо різницю — і модалка
 * піднімається рівно настільки, наскільки її перекрили.
 */
export const useKeyboardInset = (enabled: boolean): number => {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setInset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const obscured = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(obscured > KEYBOARD_MIN_HEIGHT ? obscured : 0);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return inset;
};
