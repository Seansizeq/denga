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

export const resultValueColor = (value: number): string => {
  if (value > 0) return '#16A34A';
  if (value < 0) return '#DC2626';
  return '#050505';
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
  amountColor?: string;
  comparisonColor?: string;
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

  ctx.letterSpacing = '1px';
  drawFittedText(ctx, options.title.toLocaleUpperCase(), 76, 72, 710, 34, 24, 800);
  ctx.textAlign = 'right';
  ctx.font = '900 30px Arial, sans-serif';
  ctx.fillText('DENGA', 1004, 74);

  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';
  ctx.fillStyle = options.amountColor ?? '#050505';
  drawFittedText(ctx, options.amount, 72, 156, 936, 132, 72, 900);

  ctx.fillStyle = options.comparisonColor ?? '#050505';
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
