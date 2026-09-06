import { describe, expect, it } from 'vitest';
import { createExpiringMap } from './expiring-map.js';

/** Керований годинник: тести не мають чекати реального часу. */
const withClock = (ttlMs = 1000) => {
  let now = 0;
  const map = createExpiringMap({ ttlMs, nowFn: () => now });
  return { map, tick: (ms) => { now += ms; }, at: () => now };
};

describe('createExpiringMap', () => {
  it('поводиться як звичайна Map, поки записи живі', () => {
    const { map } = withClock();
    map.set('a', { v: 1 });
    expect(map.get('a')).toEqual({ v: 1 });
    expect(map.has('a')).toBe(true);
    expect(map.size()).toBe(1);
    expect(map.delete('a')).toBe(true);
    expect(map.get('a')).toBeUndefined();
  });

  it('віддає undefined одразу після строку — не чекаючи прибиральника', () => {
    // Інакше результат залежав би від того, чи встиг хтось щось записати.
    const { map, tick } = withClock(1000);
    map.set('a', 1);
    tick(1000);
    expect(map.get('a')).toBeUndefined();
    expect(map.has('a')).toBe(false);
  });

  it('живий запис переживає строк, якщо його перезаписали', () => {
    const { map, tick } = withClock(1000);
    map.set('a', 1);
    tick(900);
    map.set('a', 2);
    tick(900);
    expect(map.get('a')).toBe(2);
  });

  it('прибирає покинуті записи, а не тримає їх до перезапуску', () => {
    const { map, tick } = withClock(1000);
    for (let i = 0; i < 100; i += 1) map.set(`покинуто-${i}`, i);
    expect(map.size()).toBe(100);

    tick(1001);
    // Одне звичайне звернення запускає прибирання принагідно.
    map.set('свіжий', 1);

    expect(map.size()).toBe(1);
    expect(map.get('свіжий')).toBe(1);
  });

  it('не прибирає частіше, ніж раз на строк життя', () => {
    const { map, tick } = withClock(1000);
    map.set('a', 1);
    tick(100);
    map.set('b', 2);
    // Прибирання ще не мало відбутися, обидва живі.
    expect(map.size()).toBe(2);
  });

  it('sweep повертає, скільки прибрав', () => {
    const { map, tick } = withClock(1000);
    map.set('a', 1);
    map.set('b', 2);
    tick(1001);
    expect(map.sweep()).toBe(2);
    expect(map.sweep()).toBe(0);
  });

  it('size не рахує протерміноване', () => {
    const { map, tick } = withClock(1000);
    map.set('a', 1);
    tick(1001);
    expect(map.size()).toBe(0);
  });

  it('відмовляється від безглуздого строку життя', () => {
    expect(() => createExpiringMap({ ttlMs: 0 })).toThrow(/додатним/);
    expect(() => createExpiringMap({})).toThrow(/додатним/);
  });
});
