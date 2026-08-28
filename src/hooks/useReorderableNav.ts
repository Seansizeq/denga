import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hapticLight } from '../utils/notify';

export type NavKey = 'home' | 'calendar' | 'accounts' | 'stats' | 'settings';

export const DEFAULT_NAV_ORDER: readonly NavKey[] = [
  'home',
  'calendar',
  'accounts',
  'stats',
  'settings',
];

const STORAGE_KEY = 'denga.nav.order.v1';
/** Ключ від попереднього підходу — коли рухалася сама панель, а не іконки. */
const LEGACY_OFFSET_KEY = 'denga.nav.offset.v1';

/** Утримання, після якого іконка «відривається». Трохи довше, ніж у панелі:
 *  промах по вкладці тут дорожчий — це основна навігація. */
const HOLD_MS = 320;
const CANCEL_PX = 10;
/** Скільки іконка летить у свою комірку після того, як палець відпустив. */
const SETTLE_MS = 190;
/** Наскільки іконка підростає в руці. */
const LIFT_SCALE = 1.18;

const isNavKey = (value: unknown): value is NavKey =>
  typeof value === 'string' && (DEFAULT_NAV_ORDER as readonly string[]).includes(value);

/**
 * Порядок приймається, лише якщо це рівно перестановка відомих вкладок.
 * Інакше стара або зіпсована збірка сховища прибрала б із панелі половину
 * екранів — а це єдиний спосіб між ними ходити.
 */
const readStoredOrder = (): NavKey[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_NAV_ORDER];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_NAV_ORDER];
    const keys = parsed.filter(isNavKey);
    const unique = Array.from(new Set(keys));
    if (unique.length !== DEFAULT_NAV_ORDER.length) return [...DEFAULT_NAV_ORDER];
    return unique;
  } catch {
    return [...DEFAULT_NAV_ORDER];
  }
};

/**
 * Куди поїде сусідня іконка, доки перетягувана висить над чужою коміркою.
 * Рівно як на домашньому екрані: усі між «звідки» і «куди» зсуваються на одну
 * позицію назустріч, звільняючи місце.
 */
const shiftForIndex = (index: number, from: number, over: number): number => {
  if (from === over) return 0;
  if (from < over) return index > from && index <= over ? -1 : 0;
  return index >= over && index < from ? 1 : 0;
};

interface DragState {
  key: NavKey;
  from: number;
  over: number;
  colWidth: number;
}

/**
 * Перетягування іконок усередині панелі — так, як переставляють застосунки на
 * iOS: утримання, іконка підіймається в руку, сусіди розступаються, відпустив —
 * стала в комірку.
 *
 * Перетягувана іконка їде повз React: її `transform` пишеться прямо в DOM на
 * кожному русі пальця. Через стан це був би повний рендер панелі на кожну
 * подію. А от сусіди рухаються саме станом — вони переставляються лише коли
 * змінюється цільова комірка, тобто кілька разів за жест, і CSS-перехід робить
 * їхній зсув плавним сам.
 */
export const useReorderableNav = () => {
  const [order, setOrder] = useState<NavKey[]>(() => [...DEFAULT_NAV_ORDER]);
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Кадр після відпускання: комірка вже нова, тож перехід треба вимкнути,
   *  інакше іконки поїдуть удруге — з нового місця в те саме нове. */
  const [settling, setSettling] = useState(false);

  const barRef = useRef<HTMLDivElement | null>(null);
  const items = useRef(new Map<NavKey, HTMLElement>());
  const origin = useRef<{ px: number; py: number; key: NavKey; from: number } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);
  const pointerId = useRef<number | null>(null);
  const dragging = useRef(false);
  const suppressClick = useRef(false);
  const liveOver = useRef(0);

  useEffect(() => {
    setOrder(readStoredOrder());
    try {
      // Прибираємо за попередньою версією, де рухалася сама панель.
      window.localStorage.removeItem(LEGACY_OFFSET_KEY);
    } catch {
      /* сховище недоступне — нічого прибирати */
    }
  }, []);

  const clearHold = useCallback(() => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearHold();
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    },
    [clearHold],
  );

  useEffect(() => {
    if (!settling) return;
    const id = window.setTimeout(() => setSettling(false), 60);
    return () => window.clearTimeout(id);
  }, [settling]);

  const setItemRef = useCallback(
    (key: NavKey) => (el: HTMLElement | null) => {
      if (el) items.current.set(key, el);
      else items.current.delete(key);
    },
    [],
  );

  const paintDragged = useCallback((key: NavKey, dx: number) => {
    const el = items.current.get(key);
    if (!el) return;
    el.style.transform = `translate3d(${dx}px, 0, 0) scale(${LIFT_SCALE})`;
  }, []);

  const onPointerDown = useCallback(
    (key: NavKey) => (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const from = order.indexOf(key);
      if (from < 0) return;

      suppressClick.current = false;
      pointerId.current = e.pointerId;
      origin.current = { px: e.clientX, py: e.clientY, key, from };
      liveOver.current = from;
      const el = e.currentTarget;

      clearHold();
      holdTimer.current = window.setTimeout(() => {
        holdTimer.current = null;
        const bar = barRef.current;
        if (!bar) return;
        // Ширина комірки — з реальної панелі: вона залежить від ширини екрана,
        // а не від якоїсь константи.
        const colWidth = bar.getBoundingClientRect().width / order.length;
        dragging.current = true;
        try {
          if (pointerId.current !== null) el.setPointerCapture?.(pointerId.current);
        } catch {
          // Палець уже піднявся — захоплювати нічого.
        }
        hapticLight();
        setDrag({ key, from, over: from, colWidth });
        paintDragged(key, 0);
      }, HOLD_MS);
    },
    [clearHold, order, paintDragged],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const from = origin.current;
      if (!from) return;
      const dx = e.clientX - from.px;
      const dy = e.clientY - from.py;

      if (!dragging.current) {
        // Палець повіз до того, як утримання спрацювало — це не перестановка.
        if (Math.hypot(dx, dy) > CANCEL_PX) clearHold();
        return;
      }

      paintDragged(from.key, dx);

      setDrag((prev) => {
        if (!prev) return prev;
        const raw = prev.from + Math.round(dx / prev.colWidth);
        const over = Math.min(order.length - 1, Math.max(0, raw));
        liveOver.current = over;
        return over === prev.over ? prev : { ...prev, over };
      });
    },
    [clearHold, order.length, paintDragged],
  );

  const finish = useCallback(() => {
    clearHold();
    const from = origin.current;
    origin.current = null;

    if (!dragging.current || !from) {
      pointerId.current = null;
      return;
    }
    dragging.current = false;
    suppressClick.current = true;

    const el = items.current.get(from.key);
    if (el && pointerId.current !== null && el.hasPointerCapture?.(pointerId.current)) {
      el.releasePointerCapture(pointerId.current);
    }
    pointerId.current = null;

    const over = liveOver.current;
    const colWidth = barRef.current
      ? barRef.current.getBoundingClientRect().width / order.length
      : 0;

    // Спершу доводимо іконку до комірки — саме це читається як «стала на
    // місце». Порядок міняємо вже після, коли вона фізично там.
    if (el) {
      el.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      el.style.transform = `translate3d(${(over - from.from) * colWidth}px, 0, 0) scale(1)`;
    }

    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      if (el) {
        el.style.transition = '';
        el.style.transform = '';
      }
      if (over !== from.from) {
        setOrder((prev) => {
          const next = [...prev];
          const [moved] = next.splice(from.from, 1);
          next.splice(over, 0, moved);
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // Не зберегли — порядок доживе до перезапуску.
          }
          return next;
        });
      }
      setSettling(true);
      setDrag(null);
    }, SETTLE_MS);
  }, [clearHold, order.length]);

  const onClickCapture = useCallback((e: React.MouseEvent<HTMLElement>) => {
    // Палець, відпущений над вкладкою після перестановки, інакше ще й
    // перемкнув би екран.
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
  }, []);

  /** Де іконка стоїть *візуально* просто зараз — з урахуванням розступання. */
  const visualIndex = useCallback(
    (key: NavKey): number => {
      const base = order.indexOf(key);
      if (!drag) return base;
      if (key === drag.key) return drag.over;
      return base + shiftForIndex(base, drag.from, drag.over);
    },
    [drag, order],
  );

  const shiftStyle = useCallback(
    (key: NavKey): React.CSSProperties | undefined => {
      if (!drag || key === drag.key) return undefined;
      const base = order.indexOf(key);
      const shift = shiftForIndex(base, drag.from, drag.over);
      if (shift === 0) return undefined;
      return { transform: `translate3d(${shift * drag.colWidth}px, 0, 0)` };
    },
    [drag, order],
  );

  const itemHandlers = useMemo(
    () => ({ onPointerMove, onPointerUp: finish, onPointerCancel: finish, onContextMenu }),
    [finish, onContextMenu, onPointerMove],
  );

  return {
    order,
    barRef,
    draggingKey: drag?.key ?? null,
    settling,
    setItemRef,
    onPointerDown,
    itemHandlers,
    onClickCapture,
    visualIndex,
    shiftStyle,
  };
};
