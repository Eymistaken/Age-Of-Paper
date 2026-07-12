import { describe, expect, it } from 'vitest';
import {
  applySurfaceClick,
  beginBrush,
  finishBrush,
  surfacesIntersectingMarquee,
  visitBrushSurface,
} from './editorSelection';

describe('terrain editor selection', () => {
  it('implements the intentional clear-without-replace click contract', () => {
    expect(applySurfaceClick([], 'a')).toEqual(['a']);
    expect(applySurfaceClick(['a'], 'b')).toEqual([]);
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
});
