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
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', LoadedImage);

    await renderResultCardPng({
      templateUrl: '/result-cards/normal/normal-skeleton.png',
      label: 'Monthly result',
      amount: '+1 000 ₴',
      amountColor: '#16A34A',
    });

    // Рівно два рядки: підпис і сума, без капсу й без службових написів.
    expect(textCalls).toEqual([
      { text: 'Monthly result', color: '#050505' },
      { text: '+1 000 ₴', color: '#16A34A' },
    ]);
  });

  it('keeps a negative amount red and never draws branding', async () => {
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
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', LoadedImage);

    await renderResultCardPng({
      templateUrl: '/result-cards/bad/bad-kitten.png',
      label: 'day result:',
      amount: '-10$',
      amountColor: '#DC2626',
    });

    expect(textCalls).toContainEqual({ text: '-10$', color: '#DC2626' });
    expect(textCalls.map((call) => call.text)).not.toContain('DENGA');
  });
});
