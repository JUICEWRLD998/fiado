import { describe, expect, it } from 'vitest';
import { createLimiter } from './ratelimit';

describe('createLimiter', () => {
  it('allows up to the limit in a window, then refuses', () => {
    const hit = createLimiter(3, 1000, () => 0);
    expect([hit('a'), hit('a'), hit('a'), hit('a'), hit('a')]).toEqual([true, true, true, false, false]);
  });

  it('opens a fresh window after the old one ends', () => {
    let t = 0;
    const hit = createLimiter(1, 1000, () => t);
    expect(hit('a')).toBe(true);
    expect(hit('a')).toBe(false);
    t = 1000;
    expect(hit('a')).toBe(true);
  });

  it('counts each key on its own', () => {
    const hit = createLimiter(1, 1000, () => 0);
    expect(hit('a')).toBe(true);
    expect(hit('b')).toBe(true);
    expect(hit('a')).toBe(false);
    expect(hit('b')).toBe(false);
  });
});
