import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_MAX_LENGTH,
  buildFeedbackPhotoCaption,
  buildFeedbackReport,
  normalizeFeedbackImage,
  normalizeFeedbackText,
} from './feedback-report.js';

/** Рядок base64 рівно на стільки байтів картинки. */
const imageOf = (bytes) => Buffer.alloc(bytes, 7).toString('base64');

describe('normalizeFeedbackText', () => {
  it('refuses an empty message', () => {
    expect(normalizeFeedbackText('')).toBeNull();
    expect(normalizeFeedbackText('   \n  ')).toBeNull();
    expect(normalizeFeedbackText(undefined)).toBeNull();
    expect(normalizeFeedbackText(42)).toBeNull();
  });

  it('keeps paragraphs but trims the edges', () => {
    expect(normalizeFeedbackText('  перший рядок\nдругий  ')).toBe('перший рядок\nдругий');
  });

  it('cuts anything longer than the cap', () => {
    const long = 'я'.repeat(FEEDBACK_MAX_LENGTH + 500);
    expect(normalizeFeedbackText(long)).toHaveLength(FEEDBACK_MAX_LENGTH);
  });
});

describe('buildFeedbackReport', () => {
  const base = {
    text: 'Кнопка «зберегти» нічого не робить',
    userId: '12345',
    username: 'bodya',
    screen: '/stats',
    appVersion: '1.4.2',
    platform: 'android',
    tgVersion: '7.10',
  };

  it('puts the author, the screen and the build in the header', () => {
    const report = buildFeedbackReport(base);
    expect(report).toContain('Від: @bodya · id 12345');
    expect(report).toContain('Екран: /stats');
    expect(report).toContain('Збірка: 1.4.2 · android · Telegram 7.10');
    expect(report).toContain(base.text);
  });

  it('survives a missing username and missing context', () => {
    const report = buildFeedbackReport({ text: 'ловіть баг', userId: '7' });
    expect(report).toContain('Від: id 7');
    expect(report).not.toContain('Екран:');
    expect(report).not.toContain('Збірка:');
  });

  it('mentions the screenshot so a lost photo does not go unnoticed', () => {
    expect(buildFeedbackReport({ ...base, hasImage: true })).toContain('Знімок: окремим повідомленням');
    expect(buildFeedbackReport(base)).not.toContain('Знімок:');
  });

  it('adds the crash message when the report comes from the error screen', () => {
    const report = buildFeedbackReport({ ...base, error: 'TypeError: x is not a function' });
    expect(report).toContain('Помилка: TypeError: x is not a function');
  });

  it('flattens service fields so they cannot forge a header line', () => {
    const report = buildFeedbackReport({
      ...base,
      screen: '/stats\nВід: @admin · id 1',
    });
    // Підроблений рядок лишається всередині свого поля, а не стає окремим.
    expect(report).toContain('Екран: /stats Від: @admin · id 1');
    expect(report.split('\n').filter((line) => line.startsWith('Від: '))).toHaveLength(1);
  });

  it('keeps the free text last, after the separator', () => {
    const report = buildFeedbackReport({ ...base, text: 'Від: @admin · id 1' });
    const separator = report.indexOf('———');
    expect(separator).toBeGreaterThan(0);
    expect(report.indexOf('Від: @admin · id 1')).toBeGreaterThan(separator);
  });

  it('shortens an overlong service field instead of dropping it', () => {
    const report = buildFeedbackReport({ ...base, error: 'E'.repeat(900) });
    const line = report.split('\n').find((row) => row.startsWith('Помилка: '));
    expect(line?.length).toBeLessThan(500);
    expect(line?.endsWith('…')).toBe(true);
  });
});

describe('normalizeFeedbackImage', () => {
  it('пропускає відсутній знімок як відсутній, а не як помилку', () => {
    expect(normalizeFeedbackImage(undefined)).toEqual({ ok: true, image: null });
    expect(normalizeFeedbackImage(null)).toEqual({ ok: true, image: null });
    expect(normalizeFeedbackImage('')).toEqual({ ok: true, image: null });
  });

  it('приймає звичайний base64', () => {
    const image = imageOf(1024);
    expect(normalizeFeedbackImage(image)).toEqual({ ok: true, image });
  });

  it('зрізає префікс data:, якщо клієнт надіслав ціле посилання', () => {
    const image = imageOf(1024);
    expect(normalizeFeedbackImage(`data:image/jpeg;base64,${image}`)).toEqual({ ok: true, image });
  });

  it('відмовляє тому, що не є base64', () => {
    expect(normalizeFeedbackImage('це просто текст!!')).toEqual({ ok: false, reason: 'malformed' });
    expect(normalizeFeedbackImage({ nope: true })).toEqual({ ok: false, reason: 'malformed' });
    // Занадто дрібне, щоб бути картинкою: очевидно, сміття.
    expect(normalizeFeedbackImage(imageOf(10))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('відмовляє завеликому знімку окремою причиною', () => {
    const tooBig = imageOf(FEEDBACK_IMAGE_MAX_BYTES + 1024);
    expect(normalizeFeedbackImage(tooBig)).toEqual({ ok: false, reason: 'too_large' });
  });
});

describe('buildFeedbackPhotoCaption', () => {
  it('називає автора просто в підписі: знімок їде окремо від тексту', () => {
    expect(buildFeedbackPhotoCaption({ userId: '7', username: 'bodya' })).toBe(
      '🖼 Знімок до скарги · @bodya · id 7',
    );
    expect(buildFeedbackPhotoCaption({ userId: '7' })).toBe('🖼 Знімок до скарги · id 7');
  });
});
