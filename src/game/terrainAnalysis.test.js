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

  it('analyzes same-id region and marker pairs as only the owned land surfaces', async () => {
    const svg = `<svg viewBox="100 50 300 100" xmlns="http://www.w3.org/2000/svg">
      <polygon id="R-1" points="100,50 200,50 200,150 100,150"/><circle id="R-1" cx="150" cy="100" r="3"/>
      <polygon id="R-2" points="200,50 300,50 300,150 200,150"/><circle id="R-2" cx="250" cy="100" r="3"/>
      <polygon id="R-3" points="300,50 400,50 400,150 300,150"/><circle id="R-3" cx="350" cy="100" r="3"/>
    </svg>`;
    const result = await analyzeSvgTerrain({ svgText: svg });
    expect(result.surfaces.filter((surface) => !surface.synthetic).map((surface) => surface.id))
      .toEqual(['R-1', 'R-2', 'R-3']);
    expect(result.importIssues.filter((item) => item.code === 'AUXILIARY_ARTWORK')).toHaveLength(1);
    expect(result.importIssues.some((item) => item.code === 'DUPLICATE_ID')).toBe(false);
  });

  it('keeps an explicitly marked circle playable even when its semantics look like a label', async () => {
    const result = await analyzeSvgTerrain({
      svgText: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle id="island" class="label" data-terrain="land" cx="50" cy="50" r="30"/></svg>',
    });
    expect(result.surfacesById.island).toMatchObject({ terrainType: 'land', metadataTerrainType: 'land' });
  });
});
