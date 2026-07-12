import { describe, expect, it } from 'vitest';
import {
  applyCompactMetadataToSvg,
  createMetadataPackage,
  embedMapMetadata,
  extractMapMetadata,
  hashText,
  stripEditorMetadata,
  validateMetadataPackage,
} from './mapMetadata';
import { deriveTerrainDocument } from './terrainModel';

const baseSvg = '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><rect id="land_a" width="50" height="50"/><rect id="water_1" x="50" width="50" height="50"/></svg>';

function terrainDocument() {
  return deriveTerrainDocument({
    mapId: 'map_neutral_1',
    displayName: 'Deneme Haritası',
    revision: 3,
    sourceGeometryHash: 'source_hash',
    viewBox: { x: 0, y: 0, width: 100, height: 50 },
    surfaces: [
      { id: 'land_a', elementId: 'land_a', automatic: { terrainType: 'land', confidence: 0.9 }, adjacentSurfaceIds: ['water_1'] },
      { id: 'water_1', elementId: 'water_1', automatic: { terrainType: 'ocean', confidence: 0.8 }, adjacentSurfaceIds: ['land_a'] },
    ],
  });
}

describe('Age of Paper SVG metadata', () => {
  it('round trips safe versioned metadata independently of filename', async () => {
    const packageValue = createMetadataPackage(terrainDocument());
    const exported = embedMapMetadata(baseSvg, packageValue);
    const extracted = extractMapMetadata(exported);
    expect(extracted.valid).toBe(true);
    expect(extracted.metadata).toEqual(packageValue);
    expect(exported).toContain('age-of-paper-map');
    expect(stripEditorMetadata(exported)).not.toContain('age-of-paper-map');
    expect(await hashText('same')).toBe(await hashText('same'));
  });

  it('rejects invalid terrain, references and non-coastal ports', () => {
    const packageValue = createMetadataPackage(terrainDocument());
    expect(validateMetadataPackage({ ...packageValue, surfaces: [{ ...packageValue.surfaces[0], terrainType: 'space' }] }).valid).toBe(false);
    expect(validateMetadataPackage({ ...packageValue, surfaces: [{ ...packageValue.surfaces[0], adjacentSurfaceIds: ['missing'] }] }).valid).toBe(false);
    expect(validateMetadataPackage({ ...packageValue, surfaces: [{ ...packageValue.surfaces[0], coastType: 'none', portAllowed: true }] }).valid).toBe(false);
  });

  it('applies compact final data to artwork without exporting editor overlays', () => {
    const compact = createMetadataPackage(terrainDocument(), { compact: true });
    const composed = applyCompactMetadataToSvg(baseSvg, compact);
    const document = new DOMParser().parseFromString(composed, 'image/svg+xml');
    expect(document.getElementById('land_a').getAttribute('data-region')).toBe('true');
    expect(document.getElementById('water_1').hasAttribute('data-region')).toBe(false);
    expect(composed).not.toContain('selection-rectangle');
  });
});
