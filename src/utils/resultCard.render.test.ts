// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderResultCardPng } from './resultCard';

describe('result card PNG renderer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('draws a positive amount green and a negative comparison red', async () => {
    const textCalls: Array<{ text: string; color: string }> = [];
    let activeColor = '#050505';
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
      drawImage: vi.fn(),
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
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', LoadedImage);

    await renderResultCardPng({
      templateUrl: '/result-cards/normal/normal-skeleton.png',
      title: 'Monthly result',
      amount: '+1 000 ₴',
      comparison: '-20% vs previous period',
      period: 'August 2026',
      amountColor: '#16A34A',
      comparisonColor: '#DC2626',
    });

    expect(textCalls).toContainEqual({ text: '+1 000 ₴', color: '#16A34A' });
    expect(textCalls).toContainEqual({ text: '-20% VS PREVIOUS PERIOD', color: '#DC2626' });
  });

  it('renders goal hierarchy and a proportional progress bar without branding', async () => {
    const textCalls: string[] = [];
    const lineTo = vi.fn();
    const context = {
      fillStyle: '#050505',
      strokeStyle: '#050505',
      textBaseline: 'top',
      textAlign: 'left',
      letterSpacing: '0px',
      font: '',
      lineWidth: 1,
      lineCap: 'butt',
      drawImage: vi.fn(),
      measureText: (text: string) => ({ width: text.length * 20 }),
      fillText: (text: string) => textCalls.push(text),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo,
      stroke: vi.fn(),
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
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', LoadedImage);

    await renderResultCardPng({
      templateUrl: '/result-cards/normal/normal-skeleton.png',
      layout: 'goal',
      eyebrow: 'Financial goal',
      title: 'Road to 30K Dollars',
      amount: '$1 074.30',
      secondaryAmount: 'of $30 000',
      comparison: '4% completed',
      progress: 4,
      period: '137 days left',
    });

    expect(textCalls).toEqual(expect.arrayContaining([
      'FINANCIAL GOAL',
      'ROAD TO 30K DOLLARS',
      '$1 074.30',
      'of $30 000',
      '4% COMPLETED',
      '137 DAYS LEFT',
    ]));
    expect(textCalls).not.toContain('DENGA');
    expect(lineTo).toHaveBeenCalledWith(994, 445);
    expect(lineTo).toHaveBeenCalledWith(122.32, 445);
  });
});
