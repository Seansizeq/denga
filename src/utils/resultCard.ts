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
  layout?: 'period' | 'goal';
  eyebrow?: string;
  secondaryAmount?: string;
  progress?: number;
  amountColor?: string;
  comparisonColor?: string;
  periodColor?: string;
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

  if (options.layout === 'goal') {
    // Один гучний рядок — сума. Решта тихіша: дрібний підпис, тонка шкала,
    // сірі допоміжні рядки, і жодного капсу, крім службової мітки зверху.
    ctx.letterSpacing = '1.5px';
    ctx.fillStyle = 'rgba(5, 5, 5, 0.42)';
    drawFittedText(ctx, (options.eyebrow ?? '').toLocaleUpperCase(), 76, 72, 928, 23, 18, 700);

    ctx.letterSpacing = '0px';
    ctx.fillStyle = 'rgba(5, 5, 5, 0.9)';
    drawFittedText(ctx, options.title, 76, 110, 928, 40, 26, 600);

    ctx.fillStyle = options.amountColor ?? '#050505';
    drawFittedText(ctx, options.amount, 72, 176, 936, 124, 70, 800);

    ctx.fillStyle = 'rgba(5, 5, 5, 0.4)';
    drawFittedText(ctx, options.secondaryAmount ?? '', 78, 308, 924, 32, 24, 500);

    const progress = Math.max(0, Math.min(100, options.progress ?? 0));
    const barStart = 80;
    const barEnd = 1000;
    const barY = 372;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(5, 5, 5, 0.1)';
    ctx.beginPath();
    ctx.moveTo(barStart, barY);
    ctx.lineTo(barEnd, barY);
    ctx.stroke();
    if (progress > 0) {
      ctx.strokeStyle = options.comparisonColor ?? '#16A34A';
      ctx.beginPath();
      ctx.moveTo(barStart, barY);
      ctx.lineTo(barStart + ((barEnd - barStart) * progress) / 100, barY);
      ctx.stroke();
    }

    ctx.fillStyle = options.comparisonColor ?? '#050505';
    drawFittedText(ctx, options.comparison, 78, 404, 560, 30, 22, 600);

    ctx.textAlign = 'right';
    ctx.fillStyle = options.periodColor ?? 'rgba(5, 5, 5, 0.42)';
    drawFittedText(ctx, options.period, 1000, 406, 360, 27, 20, 500);
    ctx.textAlign = 'left';

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not encode result card'));
      }, 'image/png');
    });
  }

  ctx.letterSpacing = '1px';
  drawFittedText(ctx, options.title.toLocaleUpperCase(), 76, 72, 928, 34, 24, 800);

  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';
  ctx.fillStyle = options.amountColor ?? '#050505';
  drawFittedText(ctx, options.amount, 72, 156, 936, 132, 72, 900);

  ctx.fillStyle = options.comparisonColor ?? '#050505';
  drawFittedText(ctx, options.comparison.toLocaleUpperCase(), 78, 318, 924, 44, 30, 800);

  ctx.fillStyle = options.periodColor ?? 'rgba(5, 5, 5, 0.58)';
  ctx.font = '700 31px Arial, sans-serif';
  drawFittedText(ctx, options.period.toLocaleUpperCase(), 78, 382, 924, 31, 24, 700);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode result card'));
    }, 'image/png');
  });
};
