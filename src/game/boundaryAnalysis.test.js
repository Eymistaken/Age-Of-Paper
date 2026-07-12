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

  it('accepts a connected five-surface ring with detectable inside and outside', () => {
    const ring = ['r1', 'r2', 'r3', 'r4', 'r5'];
    const surfaces = ring.map((id, index) => surface(id, [ring[(index + 4) % 5], ring[(index + 1) % 5], 'inside', 'outside']));
    surfaces.push(surface('inside', ring));
    surfaces.push({ ...surface('outside', ring, 'ocean'), touchesRootBoundary: true });
    const document = { surfaces, surfacesById: Object.fromEntries(surfaces.map((item) => [item.id, item])) };
    const result = analyzeSelectedBoundary(document, ring);
    expect(result).toMatchObject({ valid: true, reasonCode: null, interiorIds: ['inside'], outsideIds: ['outside'] });
  });

  it('reports disconnected boundary components before attempting flood fill', () => {
    const surfaces = [surface('a', ['b']), surface('b', ['a']), surface('c', ['d']), surface('d', ['c']), surface('outside', [], 'ocean')];
    const document = { surfaces, surfacesById: Object.fromEntries(surfaces.map((item) => [item.id, item])) };
    expect(analyzeSelectedBoundary(document, ['a', 'b', 'c', 'd'])).toMatchObject({
      valid: false, reasonCode: 'DISCONNECTED_BOUNDARY', interiorIds: [],
    });
  });

  it('reports selected endpoints with fewer than two selected neighbors', () => {
    const surfaces = [surface('a', ['b']), surface('b', ['a', 'c']), surface('c', ['b']), surface('outside', ['a', 'c'], 'ocean')];
    const document = { surfaces, surfacesById: Object.fromEntries(surfaces.map((item) => [item.id, item])) };
    const result = analyzeSelectedBoundary(document, ['a', 'b', 'c']);
    expect(result.reasonCode).toBe('BOUNDARY_ENDPOINTS');
    expect(result.reason).toContain('2 seçili komşu');
  });

  it('rejects an ordinary filled area because no enclosed interior remains', () => {
    const selected = ['center', 'north', 'east', 'south', 'west'];
    const surfaces = [
      surface('center', ['north', 'east', 'south', 'west']),
      surface('north', ['center', 'east', 'west', 'outside']),
      surface('east', ['center', 'north', 'south', 'outside']),
      surface('south', ['center', 'east', 'west', 'outside']),
      surface('west', ['center', 'north', 'south', 'outside']),
      { ...surface('outside', ['north', 'east', 'south', 'west'], 'ocean'), touchesRootBoundary: true },
    ];
    const document = { surfaces, surfacesById: Object.fromEntries(surfaces.map((item) => [item.id, item])) };
    expect(analyzeSelectedBoundary(document, selected)).toMatchObject({ valid: false, reasonCode: 'NO_INTERIOR', interiorIds: [] });
  });

  it('specifically reports that no outside area remains when every surface is selected', () => {
    const surfaces = [surface('a', ['b', 'c']), surface('b', ['a', 'c']), surface('c', ['a', 'b'])];
    const document = { surfaces, surfacesById: Object.fromEntries(surfaces.map((item) => [item.id, item])) };
    const result = analyzeSelectedBoundary(document, ['a', 'b', 'c']);
    expect(result.reasonCode).toBe('NO_OUTSIDE');
    expect(result.reason).toContain('dış alan kalmadı');
    expect(result.interiorIds).toEqual([]);
  });
});
