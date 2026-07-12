import { describe, expect, it } from 'vitest';
import { analyzeSelectedBoundary } from './boundaryAnalysis';

function surface(id, neighbors, terrainType = 'land') {
  return { id, adjacentSurfaceIds: neighbors, terrainType, automatic: { terrainType } };
}

describe('selected boundary analysis', () => {
  it('separates a closed boundary, enclosed interior and outside', () => {
    const surfaces = [
      surface('north', ['east', 'west', 'inside', 'outside']),
      surface('east', ['north', 'south', 'inside', 'outside']),
      surface('south', ['east', 'west', 'inside', 'outside']),
      surface('west', ['north', 'south', 'inside', 'outside']),
      surface('inside', ['north', 'east', 'south', 'west']),
      surface('outside', ['north', 'east', 'south', 'west'], 'ocean'),
    ];
    const document = { surfaces, surfacesById: Object.fromEntries(surfaces.map((item) => [item.id, item])) };
    const result = analyzeSelectedBoundary(document, ['north', 'east', 'south', 'west']);
    expect(result.valid).toBe(true);
    expect(result.interiorIds).toEqual(['inside']);
    expect(result.outsideIds).toEqual(['outside']);
  });

  it('does not invent an interior for an open chain', () => {
    const surfaces = [surface('a', ['b']), surface('b', ['a', 'inside']), surface('inside', ['b'])];
    const document = { surfaces, surfacesById: Object.fromEntries(surfaces.map((item) => [item.id, item])) };
    const result = analyzeSelectedBoundary(document, ['a', 'b']);
    expect(result.valid).toBe(false);
    expect(result.interiorIds).toEqual([]);
    expect(result.reason).toMatch(/kapalı/);
  });
});
