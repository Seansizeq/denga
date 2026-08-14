// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedState } from './usePersistedState';

const isNumberArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((n) => typeof n === 'number');

describe('usePersistedState', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('reads back what it wrote, so the cache survives a reload', () => {
    const first = renderHook(() => usePersistedState<number[]>('k', [], { validate: isNumberArray }));
    act(() => {
      first.result.current[1]([1, 2, 3]);
    });
    first.unmount();

    const second = renderHook(() => usePersistedState<number[]>('k', [], { validate: isNumberArray }));
    expect(second.result.current[0]).toEqual([1, 2, 3]);
  });

  it('still reads a bare legacy value written before the envelope', () => {
    localStorage.setItem('legacy', JSON.stringify([4, 5]));
    const { result } = renderHook(() =>
      usePersistedState<number[]>('legacy', [], { validate: isNumberArray }),
    );
    expect(result.current[0]).toEqual([4, 5]);
  });

  it('drops the cache when the stored version does not match', () => {
    localStorage.setItem('versioned', JSON.stringify({ v: 1, data: [9] }));
    const { result } = renderHook(() =>
      usePersistedState<number[]>('versioned', [], { validate: isNumberArray, version: 2 }),
    );
    expect(result.current[0]).toEqual([]);
  });

  it('rejects a stored value that fails validation', () => {
    localStorage.setItem('bad', JSON.stringify({ data: ['nope'] }));
    const { result } = renderHook(() =>
      usePersistedState<number[]>('bad', [], { validate: isNumberArray }),
    );
    expect(result.current[0]).toEqual([]);
  });
});
