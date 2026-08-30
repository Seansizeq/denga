import type { StatsRange } from './statsPeriod';

export type ResultCardGroup = 'great' | 'normal' | 'bad' | 'very-bad' | 'week-bad';

const RESULT_CARD_TEMPLATES: Record<ResultCardGroup, readonly string[]> = {
  great: [
    'great-haunter.png',
    'great-eyes.png',
    'great-anime.png',
    'great-ghostface.png',
    'great-chimp-guns.png',
    'great-arms-raised.png',
    'great-redeemer.png',
    'great-horse-statue.png',
    'great-chimp-thinker.png',
    'great-boy-cat.png',
    'great-helicopter.png',
    'great-anime-eyes.png',
    'great-bull-toilet.png',
  ],
  normal: [
    'normal-boxing-hedgehog.png',
    'normal-smoking-cat.png',
    'normal-smiling-face.png',
    'normal-skeleton.png',
    'normal-boy-tank.png',
    'normal-boy-machete.png',
    'normal-chimp-peek.png',
    'normal-calvin-pee.png',
    'normal-rifle-flowers.png',
    'normal-glasses-portrait.png',
    'normal-thorn-creature.png',
    'normal-hands-face.png',
    'normal-anime-organs.png',
  ],
  bad: [
    'bad-boxing-child.png',
    'bad-kitten.png',
    'bad-scarface.png',
    'bad-stunned-face.png',
  ],
  'very-bad': [
    'very-bad-apple-core.png',
    'very-bad-crying-baby.png',
    'very-bad-sun-face.png',
  ],
  'week-bad': [
    'week-bad-car-crash.png',
    'week-bad-covered-eyes.png',
    'week-bad-creature.png',
    'week-bad-cross.png',
    'week-bad-drowning-girl.png',
    'week-bad-embrace.png',
    'week-bad-fight-club.png',
  ],
};

const nearlyZero = (value: number): boolean => Math.abs(value) < 0.005;

/** Ті самі зелений і червоний, якими застосунок скрізь позначає плюс і мінус. */
export const resultValueColor = (value: number): string => {
  if (value > 0) return '#4cd97b';
  if (value < 0) return '#ff5a63';
  return '#ffffff';
};

/**
 * Positive means the result improved, including when both periods are negative
 * (for example -50 after -100 is a +50% improvement).
 */
export const calculateResultChange = (current: number, previous: number): number | null => {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || nearlyZero(previous)) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};

export const selectResultCardGroup = (
  range: StatsRange,
  currentNet: number,
  previousNet: number,
): ResultCardGroup => {
  if (range === 'week' && currentNet < 0) return 'week-bad';
  if (nearlyZero(currentNet)) return 'normal';

  if (currentNet > 0) {
    const change = calculateResultChange(currentNet, previousNet);
    return change === null || change >= 10 ? 'great' : 'normal';
  }

  const becameNegative = previousNet >= 0;
  const materiallyWorse = previousNet < 0 && Math.abs(currentNet) >= Math.abs(previousNet) * 1.5;
  return becameNegative || materiallyWorse ? 'very-bad' : 'bad';
};

const parseCalendarDate = (value: string | null): Date | null => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(23, 59, 59, 999);
  return Number.isFinite(date.getTime()) ? date : null;
};

export const selectGoalResultCardGroup = (params: {
  saved: number;
  target: number;
  createdAt: string;
  deadline: string | null;
  now?: Date;
}): ResultCardGroup => {
  const { saved, target, createdAt, deadline, now = new Date() } = params;
  if (!(target > 0)) return 'normal';
  const progress = Math.max(0, (saved / target) * 100);
  if (progress >= 100) return 'great';

  const deadlineDate = parseCalendarDate(deadline);
  const createdDate = new Date(createdAt);
  if (deadlineDate && Number.isFinite(createdDate.getTime()) && deadlineDate > createdDate) {
    if (now > deadlineDate) return 'very-bad';
    const expected = Math.min(
      100,
      Math.max(0, ((now.getTime() - createdDate.getTime()) / (deadlineDate.getTime() - createdDate.getTime())) * 100),
    );
    const delta = progress - expected;
    if (delta >= 10) return 'great';
    if (delta >= -10) return 'normal';
    return delta >= -30 ? 'bad' : 'very-bad';
  }

  if (progress >= 75) return 'great';
  if (progress >= 25 || nearlyZero(progress)) return 'normal';
  return 'bad';
};

export const getResultCardTemplates = (group: ResultCardGroup): readonly string[] =>
  RESULT_CARD_TEMPLATES[group];

export const getResultCardTemplateUrl = (group: ResultCardGroup, index: number): string => {
  const templates = RESULT_CARD_TEMPLATES[group];
  const normalizedIndex = ((index % templates.length) + templates.length) % templates.length;
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}result-cards/${group}/${templates[normalizedIndex]}`;
};

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load result card template: ${url}`));
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

/** Світле чорнило замість чорного — те саме, що `--text-primary`. */
const INK_R = 0xff;
const INK_G = 0xff;
const INK_B = 0xff;

/**
 * Шаблони намальовано чорним по білому, а тло тепер темне — на ньому чорний
 * малюнок просто зник би. Тому яскравість пікселя стає його прозорістю
 * навпаки: біле тло йде в ніщо, чорні лінії стають щільним світлим чорнилом,
 * а сірі краї згладжування — напівпрозорими, тож малюнок лишається м'яким.
 *
 * Попіксельно, а не через `globalCompositeOperation`: там, де режим накладання
 * не підтримується, він мовчки відкочується до `source-over` і залив би картку
 * білим. Півтора мільйона пікселів один раз на картинку того не варті.
 */
const toLightInk = (template: HTMLImageElement): HTMLCanvasElement => {
  const layer = document.createElement('canvas');
  layer.width = CARD_WIDTH;
  layer.height = CARD_HEIGHT;
  const ctx = layer.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');

  ctx.drawImage(template, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  const frame = ctx.getImageData(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const pixels = frame.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const luminance = (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000;
    // Множимо на власну прозорість, щоб заокруглені кути шаблона лишилися
    // порожніми, а не залилися чорнилом (там RGB нульові, тобто «чорні»).
    pixels[i + 3] = ((255 - luminance) * pixels[i + 3]) / 255;
    pixels[i] = INK_R;
    pixels[i + 1] = INK_G;
    pixels[i + 2] = INK_B;
  }
  ctx.putImageData(frame, 0, 0);
  return layer;
};

export interface RenderResultCardOptions {
  templateUrl: string;
  /** Дрібний рядок над сумою: «Результат за день», «Зароблено сьогодні». */
  label: string;
  /** Уже відформатована й підписана сума — єдиний гучний елемент картки. */
  amount: string;
  amountColor?: string;
}

/** Draws exact tracker values over a static template; no AI-generated text or numbers. */
export const renderResultCardPng = async (options: RenderResultCardOptions): Promise<Blob> => {
  const template = await loadImage(options.templateUrl);
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');

  drawAppBackdrop(ctx);
  ctx.drawImage(toLightInk(template), 0, 0);
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
