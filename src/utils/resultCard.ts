/** Скільки грошей на малюнку — стільки, скільки вийшло за період. */
export type ResultCardTier = 'coins' | 'roll' | 'stacks' | 'pyramid' | 'pile';

interface MoneyTier {
  tier: ResultCardTier;
  /** Верхня межа щабля, у доларах; останній щабель без стелі. */
  upToUsd: number;
  file: string;
  /**
   * Яку частку відведеної коробки займає фото. Дрібні гроші мусять і виглядати
   * дрібними: якби кожен щабель розтягувався на всю коробку, жменя монет
   * важила б на картці рівно стільки ж, скільки гора пачок.
   */
  fill: number;
}

/**
 * Пороги в доларах, бо й купюри на фото доларові. Суми в інших валютах
 * застосунок переганяє в USD своїм курсом перед вибором щабля — інакше
 * тисяча гривень тягла б на ту саму гору, що й тисяча доларів.
 */
const MONEY_TIERS: readonly MoneyTier[] = [
  { tier: 'coins', upToUsd: 50, file: 'coins.png', fill: 0.46 },
  { tier: 'roll', upToUsd: 200, file: 'roll.png', fill: 0.55 },
  { tier: 'stacks', upToUsd: 1000, file: 'stacks.png', fill: 0.68 },
  { tier: 'pyramid', upToUsd: 5000, file: 'pyramid.png', fill: 0.86 },
  { tier: 'pile', upToUsd: Infinity, file: 'pile.png', fill: 1 },
];

/** Ті самі зелений і червоний, якими застосунок скрізь позначає плюс і мінус. */
export const resultValueColor = (value: number): string => {
  if (value > 0) return '#4cd97b';
  if (value < 0) return '#ff5a63';
  return '#ffffff';
};

/**
 * Малюнок є лише там, де є що показувати: нуль і мінус лишають картку з самим
 * підписом і сумою.
 */
export const selectResultCardTier = (amountUsd: number): ResultCardTier | null => {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return null;
  return (MONEY_TIERS.find((step) => amountUsd < step.upToUsd) ?? MONEY_TIERS[MONEY_TIERS.length - 1]).tier;
};

const tierArt = (tier: ResultCardTier): MoneyTier =>
  MONEY_TIERS.find((step) => step.tier === tier) ?? MONEY_TIERS[0];

export const getResultCardTierUrl = (tier: ResultCardTier): string => {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}result-cards/money/${tierArt(tier).file}`;
};

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load result card art: ${url}`));
    image.src = url;
  });

const drawFittedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  startSize: number,
  minSize: number,
  weight: number,
): void => {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  ctx.fillText(text, x, y);
};

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

// Коробка під фото: під сумою й до самого низу картки. Усі щаблі стоять
// підошвою на одній лінії, тож гроші ніби ростуть з дна кадру.
const ART_TOP = 560;
const ART_BOTTOM = 1290;
const ART_LEFT = 90;
const ART_RIGHT = 990;

const drawAppBackdrop = (ctx: CanvasRenderingContext2D): void => {
  ctx.fillStyle = '#0f0c1c';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Свічення знизу-ліворуч, як у AmbientBackground: верх лишається майже
  // чорним, низ теплішає фіолетовим.
  //
  // Осердя навмисно винесене за нижній край і розтягнуте ширше за кадр. З
  // екранними числами `.blob1` пляма лягала кружком просто за малюнком і
  // читалася прожектором з помітним обідком: на екрані її розмиває `blur(80px)`
  // і ховає скло панелей, а тут вона гола. Пологі стопи роблять те саме, що там
  // робить розмиття.
  const glow = ctx.createRadialGradient(440, 1480, 0, 440, 1480, 1080);
  glow.addColorStop(0, 'rgba(142, 116, 255, 0.42)');
  glow.addColorStop(0.25, 'rgba(124, 92, 255, 0.3)');
  glow.addColorStop(0.5, 'rgba(100, 70, 242, 0.16)');
  glow.addColorStop(0.75, 'rgba(86, 58, 236, 0.05)');
  glow.addColorStop(1, 'rgba(86, 58, 236, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
};

/**
 * Фото лягає як є — кольоровим і в своїх пропорціях. Розтягнути його по
 * коробці означало б поставити пачку косо, тож коробка лише обмежує розмір:
 * менший з двох масштабів вписує фото цілком, а зайве місце лишається тлом.
 */
const drawMoneyArt = (ctx: CanvasRenderingContext2D, art: HTMLImageElement, fill: number): void => {
  const sourceWidth = art.naturalWidth || art.width;
  const sourceHeight = art.naturalHeight || art.height;
  if (!sourceWidth || !sourceHeight) return;

  const boxWidth = (ART_RIGHT - ART_LEFT) * fill;
  const boxHeight = (ART_BOTTOM - ART_TOP) * fill;
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  ctx.drawImage(art, (CARD_WIDTH - width) / 2, ART_BOTTOM - height, width, height);
};

export interface RenderResultCardOptions {
  /** Щабель грошей або `null`, коли малюнка бути не має. */
  tier: ResultCardTier | null;
  /** Дрібний рядок над сумою: «Результат за день», «Зароблено сьогодні». */
  label: string;
  /** Уже відформатована й підписана сума — єдиний гучний елемент картки. */
  amount: string;
  amountColor?: string;
}

/** Draws exact tracker values over a static template; no AI-generated text or numbers. */
export const renderResultCardPng = async (options: RenderResultCardOptions): Promise<Blob> => {
  const art = options.tier ? await loadImage(getResultCardTierUrl(options.tier)) : null;
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');

  drawAppBackdrop(ctx);
  if (art && options.tier) drawMoneyArt(ctx, art, tierArt(options.tier).fill);
  ctx.textBaseline = 'top';

  // Два рядки по центру над малюнком — підпис і сума. Ні назви, ні шкали,
  // ні порівнянь: усе це лишається в застосунку, а не на картинці.
  const centerX = CARD_WIDTH / 2;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '0px';

  ctx.fillStyle = '#9490a0';
  drawFittedText(ctx, options.label, centerX, 250, 900, 46, 30, 700);

  ctx.fillStyle = options.amountColor ?? '#ffffff';
  drawFittedText(ctx, options.amount, centerX, 340, 900, 150, 80, 800);

  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode result card'));
    }, 'image/png');
  });
};
