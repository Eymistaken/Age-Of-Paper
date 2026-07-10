import { describe, expect, it } from 'vitest';
import { COLORS, MAX_PLAYERS } from './constants';

describe('10 player room constants', () => {
  it('offers one distinct color for every room slot', () => {
    expect(MAX_PLAYERS).toBe(10);
    expect(COLORS).toHaveLength(MAX_PLAYERS);
    expect(new Set(COLORS).size).toBe(MAX_PLAYERS);
  });
});
