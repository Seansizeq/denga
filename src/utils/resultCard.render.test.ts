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
});
