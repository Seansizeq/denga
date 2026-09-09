// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderResultCardPng } from './resultCard';

interface DrawnImage {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Harness {
  textCalls: Array<{ text: string; color: string }>;
  drawnImages: DrawnImage[];
}

/** Полотно й `Image` живуть лише в браузері, тож обидва підмінені заглушками. */
const stubCanvas = (art: { width: number; height: number }): Harness => {
  const textCalls: Array<{ text: string; color: string }> = [];
  const drawnImages: DrawnImage[] = [];
  let activeColor = '#9490a0';

  const context = {
    get fillStyle() {
      return activeColor;
    },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      activeColor = String(value);
    },
    textBaseline: 'top',
    textAlign: 'left',
    letterSpacing: '0px',
    font: '',
    drawImage: (_image: unknown, x: number, y: number, width: number, height: number) =>
      drawnImages.push({ x, y, width, height }),
    fillRect: vi.fn(),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    measureText: (text: string) => ({ width: text.length * 20 }),
    fillText: (text: string) => textCalls.push({ text, color: activeColor }),
  } as unknown as CanvasRenderingContext2D;

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' })),
  } as unknown as HTMLCanvasElement;

  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) =>
    tagName === 'canvas' ? canvas : originalCreateElement(tagName)) as typeof document.createElement);

  class LoadedImage {
    decoding = 'async';
    naturalWidth = art.width;
    naturalHeight = art.height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', LoadedImage);

  return { textCalls, drawnImages };
};

describe('result card PNG renderer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('draws a positive amount green under its own label', async () => {
    const harness = stubCanvas({ width: 1304, height: 593 });

    await renderResultCardPng({
      tier: 'pile',
      label: 'Monthly result',
      amount: '+1 000 ₴',
      amountColor: '#4cd97b',
    });

    // Рівно два рядки: підпис і сума, без капсу й без службових написів.
    expect(harness.textCalls).toEqual([
      { text: 'Monthly result', color: '#9490a0' },
      { text: '+1 000 ₴', color: '#4cd97b' },
    ]);
  });

  it('keeps the photo in its own proportions, centred and standing on the floor', async () => {
    const harness = stubCanvas({ width: 1304, height: 593 });

    await renderResultCardPng({ tier: 'pile', label: 'Day result', amount: '+7 089 $' });

    expect(harness.drawnImages).toHaveLength(1);
    const [drawn] = harness.drawnImages;
    // Жодного розтягування: співвідношення сторін те саме, що у файлі.
    expect(drawn.width / drawn.height).toBeCloseTo(1304 / 593, 5);
    // Рівно по центру картки й підошвою на спільній лінії.
    expect(drawn.x).toBeCloseTo((1080 - drawn.width) / 2, 5);
    expect(drawn.y + drawn.height).toBeCloseTo(1290, 5);
    expect(drawn.width).toBeLessThanOrEqual(900);
  });

  it('draws a smaller photo for a smaller tier', async () => {
    const coins = stubCanvas({ width: 379, height: 451 });
    await renderResultCardPng({ tier: 'coins', label: 'Day result', amount: '+12 $' });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    const pyramid = stubCanvas({ width: 379, height: 451 });
    await renderResultCardPng({ tier: 'pyramid', label: 'Day result', amount: '+1 089 $' });

    expect(coins.drawnImages[0].height).toBeLessThan(pyramid.drawnImages[0].height);
  });

  it('leaves a loss without any art and keeps the amount red', async () => {
    const harness = stubCanvas({ width: 379, height: 451 });

    await renderResultCardPng({
      tier: null,
      label: 'day result:',
      amount: '-10$',
      amountColor: '#ff5a63',
    });

    expect(harness.drawnImages).toEqual([]);
    expect(harness.textCalls).toContainEqual({ text: '-10$', color: '#ff5a63' });
    expect(harness.textCalls.map((call) => call.text)).not.toContain('DENGA');
  });
});
