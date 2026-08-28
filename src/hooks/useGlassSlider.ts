import { useCallback, useEffect, useRef, useState } from 'react';
import { hapticLight } from '../utils/notify';

/** Скільки пальцю треба проїхати, щоб це вважалося тягненням, а не тапом. */
const DRAG_PX = 6;
/** Скло летить у комірку після відпускання. */
const SETTLE_MS = 260;
const SETTLE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** Скільки після жесту гасимо клік, який браузер шле слідом за pointerup. */
const CLICK_GUARD_MS = 400;

interface Options {
  /** Скільки всього вкладок. */
  count: number;
  /** Колонка активної вкладки, 1-based — звідки скло стартує. */
  column: number | null;
  /** Куди перейти, коли скло опустили на колонку (0-based). */
  onPick: (index: number) => void;
}

/**
 * Скло тягнеться пальцем понад іконками.
 *
 * Підкладка активної вкладки лежить рівно під активною іконкою, тож жест
 * починається з натискання на неї — палець фізично опиняється на склі. Доки
 * рух не перевищив поріг, це звичайний тап і вкладка відкривається як раніше.
 *
 * Саме скло рухається повз React: `transform` пишеться прямо в DOM на кожен
 * рух пальця. У стані живе тільки колонка, над якою скло зараз висить, — вона
 * змінюється кілька разів за жест і потрібна, щоб підсвітити іконку під ним.
 *
 * Відпустили — скло долітає до найближчої комірки, і аж тоді міняється екран.
 */
export const useGlassSlider = ({ count, column, onPick }: Options) => {
  const glassRef = useRef<HTMLElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const origin = useRef<{ px: number; startCol: number; colWidth: number } | null>(null);
  const dragging = useRef(false);
  /**
   * Час завершення жесту, а не просто прапорець.
   *
   * Прапорець лишався б піднятим, якби після перетягування клік так і не
   * прийшов — палець підняли повз посилання, браузер його не згенерував — і
   * тоді він з'їдав би наступний, ні в чому не винний тап. Вікном ця пастка
   * закривається сама.
   */
  const draggedAt = useRef(0);
  const settleTimer = useRef<number | null>(null);
  const liveCol = useRef(0);

  /** Колонка під склом просто зараз, 0-based. null — жест не йде. */
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    },
    [],
  );

  const paint = useCallback((x: number) => {
    const el = glassRef.current;
    if (!el) return;
    // -50% по вертикалі — з базового правила: підкладка центрована по висоті.
    el.style.transform = `translate3d(${x}px, -50%, 0)`;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (column === null) return;
      const bar = barRef.current;
      const glass = glassRef.current;
      if (!bar || !glass) return;

      // Ширина комірки — з реальної панелі: вона залежить від ширини екрана.
      const colWidth = glass.getBoundingClientRect().width;
      origin.current = { px: e.clientX, startCol: column - 1, colWidth };
      liveCol.current = column - 1;
      dragging.current = false;

      if (settleTimer.current !== null) {
        window.clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* вказівника вже немає — рух просто піде без захоплення */
      }
    },
    [column],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const from = origin.current;
      if (!from) return;
      const dx = e.clientX - from.px;

      if (!dragging.current) {
        if (Math.abs(dx) < DRAG_PX) return;
        dragging.current = true;
        const el = glassRef.current;
        // Перехід геть: під пальцем скло має бути там, де палець, без анімації.
        if (el) el.style.transition = 'none';
        hapticLight();
        setHoverIndex(from.startCol);
      }

      const max = (count - 1) * from.colWidth;
      const x = Math.min(max, Math.max(0, from.startCol * from.colWidth + dx));
      paint(x);

      const over = Math.round(x / from.colWidth);
      if (over !== liveCol.current) {
        liveCol.current = over;
        setHoverIndex(over);
      }
    },
    [count, paint],
  );

  const finish = useCallback(() => {
    const from = origin.current;
    origin.current = null;
    if (!from || !dragging.current) {
      dragging.current = false;
      return;
    }
    dragging.current = false;
    draggedAt.current = Date.now();

    const target = liveCol.current;
    const el = glassRef.current;
    if (el) {
      // Долітаємо до комірки самі, а не чекаємо, доки перемалюється маршрут:
      // так скло стає на місце одним рухом, без ривка на зміні екрана.
      el.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASE}`;
      el.style.transform = `translate3d(${target * from.colWidth}px, -50%, 0)`;
    }

    onPick(target);

    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      setHoverIndex(null);
      // Знімаємо інлайн: далі позицією знову керує `--indicator-col`, і вона
      // на цей момент уже дорівнює тій самій комірці.
      if (el) {
        el.style.transition = '';
        el.style.transform = '';
      }
    }, SETTLE_MS + 20);
  }, [onPick]);

  const onClickCapture = useCallback((e: React.MouseEvent<HTMLElement>) => {
    // Палець, відпущений над чужою вкладкою, інакше відкрив би її ще й кліком —
    // поверх того переходу, який ми вже зробили самі.
    if (Date.now() - draggedAt.current > CLICK_GUARD_MS) return;
    draggedAt.current = 0;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    barRef,
    glassRef,
    hoverIndex,
    isSliding: hoverIndex !== null,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
    onClickCapture,
  };
};
