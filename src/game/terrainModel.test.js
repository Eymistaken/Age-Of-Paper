import { describe, expect, it } from 'vitest';
import {
  buildCompatibilityMapDefinition,
  deriveTerrainDocument,
  normalizeSurface,
} from './terrainModel';

function surface(id, automatic, extra = {}) {
  return {
    id,
    name: id,
    automatic: { terrainType: automatic, confidence: 0.72 },
    adjacentSurfaceIds: [],
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    ...extra,
  };
}

describe('terrain document derivation', () => {
  it('uses override, metadata and automatic precedence and clamps confidence', () => {
    expect(normalizeSurface(surface('a', 'land', {
      automatic: { terrainType: 'land', confidence: 9 },
      metadataTerrainType: 'lake',
      hostOverride: 'ocean',
    }))).toMatchObject({
      terrainType: 'ocean',
      classificationSource: 'host_override',
      confidence: 1,
    });
    expect(normalizeSurface(surface('b', 'land', { metadataTerrainType: 'lake' })))
      .toMatchObject({ terrainType: 'lake', classificationSource: 'metadata' });
    expect(normalizeSurface(surface('c', 'land')))
      .toMatchObject({ terrainType: 'land', classificationSource: 'automatic' });
  });

  it('derives ocean/lake/both coasts and enforces port eligibility', () => {
    const derived = deriveTerrainDocument({
      surfaces: [
        surface('coast', 'land', { adjacentSurfaceIds: ['sea'], portPreference: false }),
        surface('both', 'land', { adjacentSurfaceIds: ['sea', 'lake'] }),
        surface('inland', 'land'),
        surface('sea', 'ocean', { adjacentSurfaceIds: ['coast', 'both'] }),
        surface('lake', 'lake', { adjacentSurfaceIds: ['both'] }),
      ],
    });
    expect(derived.surfacesById.coast).toMatchObject({ coastType: 'ocean', portAllowed: false });
    expect(derived.surfacesById.both).toMatchObject({ coastType: 'both', portAllowed: true });
    expect(derived.surfacesById.inland).toMatchObject({ coastType: 'none', portAllowed: false });
    expect(derived.summary).toMatchObject({ playableLandCount: 3, oceanCount: 1, lakeCount: 1, coastalLandCount: 2 });
  });

  it('keeps only land playable and invalidates routes whose coasts disappear', () => {
    const derived = deriveTerrainDocument({
      viewBox: { x: 0, y: 0, width: 30, height: 10 },
      compatibilityRoutes: [['a', 'b'], ['a', 'c']],
      surfaces: [
        surface('a', 'land', { adjacentSurfaceIds: ['b', 'sea'] }),
        surface('b', 'land', { adjacentSurfaceIds: ['a', 'sea'] }),
        surface('c', 'land', { hostOverride: 'ignored', adjacentSurfaceIds: ['a'] }),
        surface('sea', 'ocean', { adjacentSurfaceIds: ['a', 'b'] }),
      ],
    });
    const map = buildCompatibilityMapDefinition(derived);
    expect(map.regionIds).toEqual(['a', 'b']);
    expect(map.regionsById.a).toMatchObject({ coastal: true, portAllowed: true, seaNeighbors: ['b'] });
    expect(map.regionsById.b.claimNeighbors).toEqual(['a']);
    expect(derived.invalidatedCompatibilityRoutes).toEqual([['a', 'c']]);
  });
});
