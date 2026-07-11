import { describe, expect, it } from 'vitest';
import { getDrawerSnapPoints, pickDrawerSnap } from './drawer';

describe('mobile drawer math', () => {
  it('creates three ordered snap points for portrait, landscape, and tablet viewports', () => {
    for (const viewport of [
      { height: 915, hudBottom: 68 },
      { height: 360, hudBottom: 62 },
      { height: 1024, hudBottom: 68 },
    ]) {
      const snaps = getDrawerSnapPoints(viewport);
      expect(snaps.compact).toBeLessThan(snaps.half);
      expect(snaps.half).toBeLessThan(snaps.expanded);
      expect(snaps.expanded).toBeLessThanOrEqual(viewport.height - viewport.hudBottom - 48);
    }
  });

  it('uses velocity direction for a fling and nearest distance for a slow release', () => {
    const snaps = { compact: 280, half: 470, expanded: 650 };
    expect(pickDrawerSnap({ height: 430, velocity: 0.9, snaps })).toBe('expanded');
    expect(pickDrawerSnap({ height: 520, velocity: -0.9, snaps })).toBe('compact');
    expect(pickDrawerSnap({ height: 430, velocity: 0.05, snaps })).toBe('half');
  });
});
