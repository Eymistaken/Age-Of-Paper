import { describe, expect, it } from 'vitest';
import {
  applySurfaceClick,
  beginBrush,
  finishBrush,
  surfacesIntersectingMarquee,
  visitBrushSurface,
} from './editorSelection';

describe('terrain editor selection', () => {
  it('replaces a normal click selection and keeps Ctrl toggle behavior', () => {
    expect(applySurfaceClick([], 'a')).toEqual(['a']);
    expect(applySurfaceClick(['a'], 'b')).toEqual(['b']);
    expect(applySurfaceClick(['a', 'b'], 'a')).toEqual(['a', 'b']);
    expect(applySurfaceClick(['a'], null)).toEqual([]);
    expect(applySurfaceClick(['a'], 'b', { ctrl: true })).toEqual(['a', 'b']);
    expect(applySurfaceClick(['a', 'b'], 'a', { ctrl: true })).toEqual(['b']);
  });

  it('chooses one ctrl brush mode and visits a surface only once', () => {
    let stroke = beginBrush(['a'], 'a', { ctrl: true });
    expect(stroke.mode).toBe('subtract');
    stroke = visitBrushSurface(stroke, 'b');
    stroke = visitBrushSurface(stroke, 'a');
    expect(finishBrush(stroke)).toEqual([]);
    expect(stroke.visited).toEqual(['a', 'b']);
  });

  it('uses transformed world boundaries for marquee intersection', () => {
    const rotated = [[{ x: 10, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 10 }, { x: 10, y: 0 }]];
    const far = [[{ x: 50, y: 50 }, { x: 60, y: 50 }, { x: 60, y: 60 }, { x: 50, y: 50 }]];
    expect(surfacesIntersectingMarquee([
      { id: 'rotated', boundary: rotated }, { id: 'far', boundary: far },
    ], { x: 8, y: 8, width: 4, height: 4 })).toEqual(['rotated']);
  });

  it('intersects deterministic synthetic-water grid runs in viewBox coordinates', () => {
    expect(surfacesIntersectingMarquee([{
      id: 'water_1', boundary: [], geometry: { type: 'grid_runs', columns: 10, rows: 5, runs: [[8, 9], [18, 19]] },
    }], { x: 85, y: 5, width: 5, height: 15 }, { x: 0, y: 0, width: 100, height: 50 })).toEqual(['water_1']);
  });
});
