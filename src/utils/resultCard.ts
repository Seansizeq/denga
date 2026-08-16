import type { StatsRange } from './statsPeriod';

export type ResultCardGroup = 'great' | 'normal' | 'bad' | 'very-bad' | 'week-bad';

const RESULT_CARD_TEMPLATES: Record<ResultCardGroup, readonly string[]> = {
  great: [
    'great-haunter.png',
    'great-eyes.png',
    'great-anime.png',
    'great-castle.png',
    'great-ghostface.png',
  ],
  normal: [
    'normal-boxing-hedgehog.png',
    'normal-smoking-cat.png',
    'normal-smiling-face.png',
    'normal-skeleton.png',
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

export const getResultCardTemplates = (group: ResultCardGroup): readonly string[] =>
  RESULT_CARD_TEMPLATES[group];

export const getResultCardTemplateUrl = (group: ResultCardGroup, index: number): string => {
  const templates = RESULT_CARD_TEMPLATES[group];
  const normalizedIndex = ((index % templates.length) + templates.length) % templates.length;
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}result-cards/${group}/${templates[normalizedIndex]}`;
};

export const stableResultCardIndex = (group: ResultCardGroup, periodKey: string): number => {
  const templates = RESULT_CARD_TEMPLATES[group];
  let hash = 0;
  for (const char of `${group}:${periodKey}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % templates.length;
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

export interface RenderResultCardOptions {
  templateUrl: string;
  title: string;
  amount: string;
  comparison: string;
  period: string;
}

/** Draws exact tracker values over a static template; no AI-generated text or numbers. */
export const renderResultCardPng = async (options: RenderResultCardOptions): Promise<Blob> => {
  const template = await loadImage(options.templateUrl);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');

  ctx.drawImage(template, 0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#050505';
  ctx.textBaseline = 'top';

  ctx.font = '800 34px Arial, sans-serif';
  ctx.letterSpacing = '1px';
  ctx.fillText(options.title.toLocaleUpperCase(), 76, 72);
  ctx.textAlign = 'right';
  ctx.font = '900 30px Arial, sans-serif';
  ctx.fillText('DENGA', 1004, 74);

  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';
  drawFittedText(ctx, options.amount, 72, 156, 936, 132, 72, 900);

  ctx.font = '800 44px Arial, sans-serif';
  drawFittedText(ctx, options.comparison.toLocaleUpperCase(), 78, 318, 924, 44, 30, 800);

  ctx.fillStyle = 'rgba(5, 5, 5, 0.58)';
  ctx.font = '700 31px Arial, sans-serif';
  drawFittedText(ctx, options.period.toLocaleUpperCase(), 78, 382, 924, 31, 24, 700);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode result card'));
    }, 'image/png');
  });
};
