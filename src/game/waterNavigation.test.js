import { describe, expect, it } from 'vitest';
import {
  computeNavalPresentationPath,
  findWaterCellPath,
  pathStaysOnWater,
  simplifyWaterCellPath,
} from './waterNavigation';

function mask() {
  return {
    version: 1,
    viewBox: { x: 100, y: 50, width: 60, height: 40 },
    columns: 6,
    rows: 4,
    components: [
      { id: 'ocean', runs: [[0, 5], [6, 7], [10, 11], [12, 13], [16, 17], [18, 23]], portalCell: 0 },
    ],
    coasts: { a: [{ componentId: 'ocean', cell: 6 }], b: [{ componentId: 'ocean', cell: 17 }] },
  };
}

describe('water navigation', () => {
  it('finds and safely simplifies a path around a land mask', () => {
    const source = mask();
    const path = findWaterCellPath(source, 'ocean', 6, 17);
    expect(path).not.toBeNull();
    expect(path).not.toContain(8);
    expect(path).not.toContain(9);
    const allowed = new Set(source.components[0].runs.flatMap(([start, end]) => Array.from({ length: end - start + 1 }, (_, index) => start + index)));
    const simplified = simplifyWaterCellPath(path, allowed, source.columns);
    expect(simplified.every((cell) => allowed.has(cell))).toBe(true);
    const presentation = computeNavalPresentationPath(source, 'a', 'b');
    expect(presentation.kind).toBe('water_path');
    expect(pathStaysOnWater(source, presentation)).toBe(true);
  });

  it('never returns a straight fallback when no water path exists', () => {
    const blocked = mask();
    blocked.components[0].runs = [[6, 6], [17, 17]];
    expect(computeNavalPresentationPath(blocked, 'a', 'b')).toEqual({ kind: 'highlight_only', segments: [] });
  });

  it('creates remote-voyage water segments between a lake and ocean component', () => {
    const distant = {
      version: 1,
      viewBox: { x: 0, y: 0, width: 60, height: 30 },
      columns: 6,
      rows: 3,
      components: [
        { id: 'lake', runs: [[7, 8]], portalCell: 7 },
        { id: 'ocean', runs: [[4, 5], [10, 11], [16, 17]], portalCell: 5 },
      ],
      coasts: { lake_coast: [{ componentId: 'lake', cell: 8 }], ocean_coast: [{ componentId: 'ocean', cell: 16 }] },
    };
    const result = computeNavalPresentationPath(distant, 'lake_coast', 'ocean_coast');
    expect(result.kind).toBe('remote_voyage');
    expect(result.segments.map((segment) => segment.kind)).toEqual(['water', 'remote_transition', 'water']);
    expect(pathStaysOnWater(distant, result)).toBe(true);
  });
});
