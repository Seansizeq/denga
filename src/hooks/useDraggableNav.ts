import { useCallback, useEffect, useRef } from 'react';
import { hapticLight } from '../utils/notify';

/** Утримання, після якого панель «відривається» від місця. */
const HOLD_MS = 260;
/** Зсув до спрацювання утримання скасовує його: палець явно веде, а не тримає. */
const CANCEL_PX = 10;
/** Мінімальний просвіт до краю екрана, щоб панель не ховалася наполовину. */
const EDGE_GAP = 8;
const STORAGE_KEY = 'denga.nav.offset.v1';

interface Offset {
  x: number;
  y: number;
}

const clamp = (value: number, min: number, max: number) =>
  // Коли вікно вужче за саму панель, max опиняється лівіше за min — тоді
  // тримаємося min, інакше clamp повернув би від'ємну ширину як позицію.
  max < min ? min : Math.min(max, Math.max(min, value));

const readStoredOffset = (): Offset => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { x: 0, y: 0 };
    const parsed = JSON.parse(raw) as Partial<Offset>;
    const x = Number(parsed?.x);
    const y = Number(parsed?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
    return { x, y };
  } catch {
    // Приватний режим або заблоковані дані сайту — просто стартуємо з нуля.
    return { x: 0, y: 0 };
  }
};

/**
 * Перетягування панелі пальцем, без перерендерів.
 *
 * Позиція живе в ref і пишеться прямо в `style.transform`, а не в стан React:
 * стан означав би повний рендер піддерева на кожен рух пальця, і плавність
 * тримати не вийшло б.
 *
 * Рухаємо `translate3d` — композитор робить це сам, не чіпаючи розкладку.
 *
 * Жест починається з утримання, а не з дотику: панель лишається навігацією,
 * і звичайний тап мусить і далі відкривати вкладку.
 */
export const useDraggableNav = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);
  const offset = useRef<Offset>({ x: 0, y: 0 });
  const origin = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const limits = useRef<{ minX: number; maxX: number; minY: number; maxY: number } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const pointerId = useRef<number | null>(null);
  const dragging = useRef(false);
  const suppressClick = useRef(false);
  const pending = useRef<Offset | null>(null);

  /**
   * Пишемо трансформацію одразу, без `requestAnimationFrame`.
   *
   * Кадр затримки для жесту, що йде за пальцем, помітний, а користі від
   * складання подій тут немає: на тачскріні `pointermove` і так приходить із
   * частотою екрана. Сам запис зачіпає лише `transform` — ні розкладки, ні
   * перемальовування, композитор забере зміну на найближчому кадрі.
   */
  const apply = useCallback((next: Offset) => {
    pending.current = next;
    const el = ref.current;
    if (!el) return;
    // scale домішується сюди ж: окремий CSS-клас із transform перебив би зсув.
    el.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)${
      dragging.current ? ' scale(1.03)' : ''
    }`;
  }, []);

  /** Межі рахуються від «спокійного» місця панелі — того, де вона без зсуву. */
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const restLeft = rect.left - offset.current.x;
    const restTop = rect.top - offset.current.y;
    return {
      minX: EDGE_GAP - restLeft,
      maxX: window.innerWidth - EDGE_GAP - rect.width - restLeft,
      minY: EDGE_GAP - restTop,
      maxY: window.innerHeight - EDGE_GAP - rect.height - restTop,
    };
  }, []);

  const store = useCallback((value: Offset) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Не змогли зберегти — панель просто повернеться на місце після рестарту.
    }
  }, []);

  const clearHold = useCallback(() => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const endDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    suppressClick.current = true;
    offset.current = pending.current ?? offset.current;
    store(offset.current);
    const el = ref.current;
    if (el) {
      delete el.dataset.dragging;
      if (pointerId.current !== null && el.hasPointerCapture?.(pointerId.current)) {
        el.releasePointerCapture(pointerId.current);
      }
    }
    pointerId.current = null;
    apply(offset.current);
  }, [apply, store]);

  // Відновлюємо позицію після монтування — і одразу підтягуємо в межі екрана:
  // збережено могло бути на ширшому вікні або в іншій орієнтації.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    offset.current = readStoredOffset();
    const box = measure();
    if (box) {
      offset.current = {
        x: clamp(offset.current.x, box.minX, box.maxX),
        y: clamp(offset.current.y, box.minY, box.maxY),
      };
    }
    apply(offset.current);
  }, [measure, apply]);

  useEffect(() => {
    const onResize = () => {
      const box = measure();
      if (!box) return;
      const next = {
        x: clamp(offset.current.x, box.minX, box.maxX),
        y: clamp(offset.current.y, box.minY, box.maxY),
      };
      if (next.x === offset.current.x && next.y === offset.current.y) return;
      offset.current = next;
      store(next);
      apply(next);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [measure, apply, store]);

  useEffect(() => clearHold, [clearHold]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<T>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      suppressClick.current = false;
      pointerId.current = e.pointerId;
      origin.current = { px: e.clientX, py: e.clientY, ox: offset.current.x, oy: offset.current.y };
      const el = e.currentTarget;
      clearHold();
      holdTimer.current = window.setTimeout(() => {
        holdTimer.current = null;
        dragging.current = true;
        limits.current = measure();
        el.dataset.dragging = 'true';
        // Захоплення тут, а не в pointerdown: доки жест не став перетягуванням,
        // події мають лишатися звичайними — інакше зникне тап по вкладці.
        try {
          if (pointerId.current !== null) el.setPointerCapture?.(pointerId.current);
        } catch {
          // Палець устиг піднятися до спрацювання утримання — вказівника вже
          // немає, і захоплювати нічого. Рух тоді просто піде без нього.
        }
        hapticLight();
        apply(offset.current);
      }, HOLD_MS);
    },
    [clearHold, measure, apply],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<T>) => {
      const from = origin.current;
      if (!from) return;
      const dx = e.clientX - from.px;
      const dy = e.clientY - from.py;

      if (!dragging.current) {
        if (Math.hypot(dx, dy) > CANCEL_PX) clearHold();
        return;
      }

      const box = limits.current;
      if (!box) return;
      apply({
        x: clamp(from.ox + dx, box.minX, box.maxX),
        y: clamp(from.oy + dy, box.minY, box.maxY),
      });
    },
    [clearHold, apply],
  );

  const onPointerUp = useCallback(() => {
    clearHold();
    endDrag();
    origin.current = null;
  }, [clearHold, endDrag]);

  const onClickCapture = useCallback((e: React.MouseEvent<T>) => {
    // Палець, відпущений над вкладкою після перетягування, інакше ще й
    // перемкнув би екран.
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent<T>) => {
    // Утримання на тачскріні відкриває системне меню — воно тут заважає.
    e.preventDefault();
  }, []);

  return {
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
      onContextMenu,
    },
  };
};
