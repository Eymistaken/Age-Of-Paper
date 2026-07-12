import { describe, expect, it } from 'vitest';
import {
  analyzeSvgTerrain,
  buildWaterComponents,
  classifyAutomaticSurface,
} from './terrainAnalysis';

describe('automatic terrain analysis', () => {
  it('treats explicit terrain as metadata and semantic hints as fallible automatic evidence', () => {
    expect(classifyAutomaticSurface({ id: 'water_1', className: 'lake', fill: '#62b7c6' }))
      .toMatchObject({ terrainType: 'lake' });
    expect(classifyAutomaticSurface({ id: 'plain', className: '', fill: '#c9ad78', explicitRegion: true }))
      .toMatchObject({ terrainType: 'land', confidence: expect.any(Number) });
  });

  it('classifies boundary negative space as ocean and enclosed space as lake with stable ids', () => {
    const grid = {
      columns: 5,
      rows: 5,
      owners: [
        null, null, null, null, null,
        null, 'land', 'land', 'land', null,
        null, 'land', null, 'land', null,
        null, 'land', 'land', 'land', null,
        null, null, null, null, null,
      ],
      viewBox: { x: 10, y: 20, width: 100, height: 100 },
    };
    const first = buildWaterComponents(grid);
    const second = buildWaterComponents(grid);
    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
    expect(first.map((item) => item.automatic.terrainType).sort()).toEqual(['lake', 'ocean']);
    expect(first.every((item) => item.geometry.type === 'grid_runs')).toBe(true);
  });

  it('is deterministic across viewport sizes and derives water/coast adjacency in viewBox space', async () => {
    const svg = `<svg viewBox="100 50 200 100" xmlns="http://www.w3.org/2000/svg">
      <rect id="left" data-region="true" x="100" y="50" width="80" height="100" fill="#c9ad78"/>
      <rect id="right" data-region="true" x="220" y="50" width="80" height="100" fill="#c9ad78"/>
    </svg>`;
    globalThis.innerWidth = 320;
    const narrow = await analyzeSvgTerrain({ svgText: svg });
    globalThis.innerWidth = 2200;
    const wide = await analyzeSvgTerrain({ svgText: svg });
    expect(wide.surfaces).toEqual(narrow.surfaces);
    expect(wide.viewBox).toEqual({ x: 100, y: 50, width: 200, height: 100 });
    expect(wide.surfaces.some((item) => item.terrainType === 'ocean')).toBe(true);
    expect(wide.surfacesById.left.coastType).toBe('ocean');
  });

  it('honors explicit data-terrain and data-port-allowed hints', async () => {
    const svg = `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
      <rect id="land_a" data-terrain="land" data-port-allowed="false" width="50" height="50"/>
      <rect id="water_1" data-terrain="ocean" x="50" width="50" height="50" fill="#1f5578"/>
    </svg>`;
    const result = await analyzeSvgTerrain({ svgText: svg });
    expect(result.surfacesById.land_a).toMatchObject({
      metadataTerrainType: 'land', classificationSource: 'metadata', coastType: 'ocean', portAllowed: false,
    });
    expect(result.surfacesById.water_1.terrainType).toBe('ocean');
  });
});
