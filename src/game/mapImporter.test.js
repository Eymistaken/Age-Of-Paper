import { describe, expect, it } from 'vitest';
import { importSvgMap, prepareSvgMap, rebuildPreparedMap, validatePreparedMapRecord } from './mapImporter';
import { stripEditorMetadata } from './mapMetadata';
import { readSvgFile } from './svgUpload';

describe('SVG map importer', () => {
  it('prefers explicit regions, removes decoration and sanitizes unsafe content', () => {
    const svg = `
      <svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
        <script>alert(1)</script>
        <defs><path id="template" d="M0 0 L5 0 L5 5 Z" /></defs>
        <rect id="water" class="water" width="100" height="50" />
        <path id="region.a" data-region="true" data-name="A" data-price="4000" data-income="700" data-neighbors="b" onclick="evil()" d="M0 0 L50 0 L50 50 L0 50 Z" />
        <path id="b" data-region="true" data-name="B" data-price="5000" data-income="800" data-neighbors="region.a" d="M50 0 L100 0 L100 50 L50 50 Z" />
        <image href="https://example.com/tracker.png" />
      </svg>`;
    const result = importSvgMap(svg);
    expect(result.mapDefinition.regionIds).toEqual(['region_a', 'b']);
    expect(result.mapDefinition.pricingVersion).toBe(2);
    expect(result.mapDefinition.geometryVersion).toBe(2);
    expect(result.mapDefinition.boundsSpace).toBe('viewBox');
    expect(result.mapDefinition.regionsById.region_a).toMatchObject({ price: 4000, income: 700 });
    expect(result.mapDefinition.regionsById.b).toMatchObject({ price: 5000, income: 800 });
    expect(result.validation.valid).toBe(true);
    expect(result.sanitizedSvg).not.toContain('<script');
    expect(result.sanitizedSvg).not.toContain('onclick');
    expect(result.sanitizedSvg).not.toContain('https://example.com');
    expect(result.mapDefinition.importIssues.map((item) => item.code)).toContain('NORMALIZED_ID');
  });

  it('uses deterministic viewBox geometry only during legacy import', () => {
    const svg = `<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
      <rect id="a" x="0" y="0" width="100" height="100" />
      <rect id="b" x="100" y="0" width="100" height="100" />
    </svg>`;
    const narrowViewport = importSvgMap(svg).mapDefinition;
    globalThis.innerWidth = 2400;
    const wideViewport = importSvgMap(svg).mapDefinition;
    expect(wideViewport.regions).toEqual(narrowViewport.regions);
    expect(wideViewport.importer).toBe('legacy-svg-v3');
    expect(wideViewport.pricingVersion).toBe(2);
    expect(wideViewport.regionsById.a.claimNeighbors).toEqual(['b']);
    expect(wideViewport.regionsById.b.claimNeighbors).toEqual(['a']);
  });

  it('uses explicit metadata instead of geometry and symmetrizes the graph', () => {
    const svg = `<svg viewBox="0 0 300 100" xmlns="http://www.w3.org/2000/svg">
      <rect id="a" data-region="true" data-claim-neighbors="c" x="0" width="100" height="100" />
      <rect id="b" data-region="true" x="100" width="100" height="100" />
      <rect id="c" data-region="true" x="200" width="100" height="100" />
    </svg>`;
    const result = importSvgMap(svg).mapDefinition;
    expect(result.regionsById.a.claimNeighbors).toEqual(['c']);
    expect(result.regionsById.b.claimNeighbors).toEqual(['c']);
    expect(result.regionsById.c.claimNeighbors).toEqual(expect.arrayContaining(['a', 'b']));
    expect(result.regionsById.c.claimNeighbors).not.toContain('c');
  });

  it('ignores empty viewBox space and normalizes automatic prices by median region size', () => {
    const svg = `<svg viewBox="0 0 10000 10000" xmlns="http://www.w3.org/2000/svg">
      <rect id="small" data-region="true" data-neighbors="medium" x="0" y="0" width="5" height="5" />
      <rect id="medium" data-region="true" data-neighbors="small large" x="5" y="0" width="10" height="10" />
      <rect id="large" data-region="true" data-neighbors="medium" x="15" y="0" width="20" height="20" />
    </svg>`;
    const result = importSvgMap(svg);
    expect(result.validation.valid).toBe(true);
    expect(result.mapDefinition.regions.map((region) => region.price)).toEqual([5_000, 10_000, 20_000]);
    expect(result.validation.pricingSummary).toMatchObject({ minPrice: 5_000, medianPrice: 10_000, maxPrice: 20_000 });
  });

  it('uses median pricing and a warning instead of treating an unmeasurable path as the viewBox', () => {
    const svg = `<svg viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg">
      <path id="relative" data-region="true" data-neighbors="absolute" d="m 10 10 h 20 v 20 a 400 300 0 1 1 50 50 z" />
      <path id="absolute" data-region="true" data-neighbors="relative" d="M 0 0 H 30 V 30 C 900 800 700 600 30 30 Z" />
    </svg>`;
    const result = importSvgMap(svg);
    expect(result.validation.valid).toBe(true);
    expect(result.mapDefinition.regions.map((region) => region.price)).toEqual([10_000, 10_000]);
    expect(result.validation.warnings.map((warning) => warning.code)).toContain('GEOMETRY_FALLBACK');
  });

  it('reports duplicate source IDs as invalid', () => {
    const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect id="same" data-region="true" data-neighbors="same_2" x="0" width="50" height="100" />
      <rect id="same" data-region="true" data-neighbors="same" x="50" width="50" height="100" />
    </svg>`;
    const result = importSvgMap(svg);
    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.map((item) => item.code)).toContain('DUPLICATE_ID');
  });

  it('imports multiple same-id region and centroid pairs as only the connected real regions', () => {
    const svg = `<svg viewBox="100 50 300 100" xmlns="http://www.w3.org/2000/svg">
      <polygon id="R-1" points="100,50 200,50 200,150 100,150"/><circle id="R-1" cx="150" cy="100" r="3"/>
      <polygon id="R-2" points="200,50 300,50 300,150 200,150"/><circle id="R-2" cx="250" cy="100" r="3"/>
      <polygon id="R-3" points="300,50 400,50 400,150 300,150"/><circle id="R-3" cx="350" cy="100" r="3"/>
    </svg>`;
    const result = importSvgMap(svg);
    expect(result.mapDefinition.regionIds).toEqual(['R-1', 'R-2', 'R-3']);
    expect(result.validation.valid).toBe(true);
    expect(result.validation.errors.map((item) => item.code)).not.toContain('DUPLICATE_ID');
    expect(result.mapDefinition.regionsById['R-2'].claimNeighbors).toEqual(['R-1', 'R-3']);
    expect(result.mapDefinition.importIssues.filter((item) => item.code === 'AUXILIARY_ARTWORK')).toHaveLength(1);
    const document = new DOMParser().parseFromString(result.sanitizedSvg, 'image/svg+xml');
    expect(document.querySelectorAll('[id^="aop_aux_R-"]')).toHaveLength(3);
  });

  it('does not price or expose an independent semantic label circle as claimable', () => {
    const result = importSvgMap(`<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
      <polygon id="left" points="0,0 100,0 100,100 0,100"/>
      <polygon id="right" points="100,0 200,0 200,100 100,100"/>
      <circle id="capital_label" class="label" cx="50" cy="50" r="4"/>
    </svg>`);
    expect(result.mapDefinition.regionIds).toEqual(['left', 'right']);
    expect(result.mapDefinition.regionsById.capital_label).toBeUndefined();
    expect(result.sanitizedSvg).toContain('id="capital_label"');
  });

  it('imports generic coastal and bidirectional sea-route metadata', () => {
    const svg = `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
      <rect id="a" data-region="true" data-neighbors="b" data-coastal="true" data-sea-neighbors="b" width="50" height="50" />
      <rect id="b" data-region="true" data-neighbors="a" data-coastal="true" data-sea-neighbors="a" x="50" width="50" height="50" />
    </svg>`;
    const result = importSvgMap(svg);
    expect(result.validation.valid).toBe(true);
    expect(result.mapDefinition.regionsById.a).toMatchObject({ coastal: true, seaNeighbors: ['b'] });
    expect(result.mapDefinition.regionsById.b).toMatchObject({ coastal: true, seaNeighbors: ['a'] });
  });

  it('prepares and reimports an Age of Paper SVG without repeating terrain guesses', async () => {
    const svg = `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
      <rect id="land.a" data-terrain="land" width="50" height="50"/>
      <rect id="water_1" data-terrain="ocean" x="50" width="50" height="50"/>
    </svg>`;
    const prepared = await prepareSvgMap(svg, { displayName: 'Round Trip' });
    expect(stripEditorMetadata(prepared.preparedSvg)).toBe(prepared.baseSvg);
    const reimported = await prepareSvgMap(prepared.preparedSvg);
    expect(reimported.metadataStatus).toBe('validated');
    expect(reimported.mapId).toBe(prepared.mapId);
    expect(reimported.mapDefinition).toEqual(prepared.mapDefinition);
    expect(reimported.terrainDocument.surfaces.map((surface) => ({
      id: surface.id, terrainType: surface.terrainType, coastType: surface.coastType, portAllowed: surface.portAllowed,
    }))).toEqual(prepared.terrainDocument.surfaces.map((surface) => ({
      id: surface.id, terrainType: surface.terrainType, coastType: surface.coastType, portAllowed: surface.portAllowed,
    })));
  });

  it('preserves identity, host overrides, derived coasts and port permissions through export and reimport', async () => {
    const prepared = await prepareSvgMap(`<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
      <rect id="land_a" data-terrain="land" width="50" height="50"/>
      <rect id="water_1" data-terrain="ocean" x="50" width="50" height="50"/>
    </svg>`, { displayName: 'Override Round Trip' });
    const edited = await rebuildPreparedMap(prepared, {
      ...prepared.terrainDocument,
      surfaces: prepared.terrainDocument.surfaces.map((surface) => surface.id === 'land_a'
        ? { ...surface, hostOverride: 'land', portPreference: false }
        : surface),
    });
    const reimported = await prepareSvgMap(edited.preparedSvg);
    expect(reimported.mapId).toBe(edited.mapId);
    expect(reimported.terrainDocument.surfacesById.land_a).toMatchObject({
      terrainType: 'land', hostOverride: 'land', coastType: 'ocean', portAllowed: false, portPreference: false,
    });
  });

  it('uses compact export metadata so a near-limit source can be imported by the same version', async () => {
    const filler = 'x'.repeat(599_000);
    const prepared = await prepareSvgMap(`<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><!--${filler}--><rect id="land_a" data-terrain="land" width="50" height="50"/><rect id="water_1" data-terrain="ocean" x="50" width="50" height="50"/></svg>`);
    expect(prepared.preparedSvg.length).toBeGreaterThan(600_000);
    const importedText = await readSvgFile({
      name: 'near_limit_ageofpaper.svg', type: 'image/svg+xml', size: prepared.preparedSvg.length,
      text: async () => prepared.preparedSvg,
    });
    const reimported = await prepareSvgMap(importedText);
    expect(reimported.mapId).toBe(prepared.mapId);
    expect(reimported.mapDefinition).toEqual(prepared.mapDefinition);
  });

  it('rejects an invalid trusted repository record without generating a replacement identity', () => {
    const invalid = { mapId: 'map_stable', terrainDocument: { mapId: 'map_other' }, preparedSvg: '<svg/>' };
    expect(() => validatePreparedMapRecord(invalid)).toThrow('kimliği');
    expect(invalid.mapId).toBe('map_stable');
  });

  it('allows an invalid previous-version draft to open only for explicit editor repair', async () => {
    const prepared = await prepareSvgMap('<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle id="island" data-terrain="land" cx="50" cy="50" r="30"/></svg>', { mapId: 'map_stale_draft' });
    const stale = {
      ...prepared,
      terrainDocument: { ...prepared.terrainDocument, analysisAlgorithmVersion: 'terrain-grid-v1' },
      mapDefinition: {
        ...prepared.mapDefinition,
        analysisAlgorithmVersion: 'terrain-grid-v1',
        importIssues: [{ severity: 'error', code: 'DUPLICATE_ID', message: 'Eski aday hatası' }],
      },
    };
    expect(() => validatePreparedMapRecord(stale)).toThrow('Analizi Sıfırla');
    expect(validatePreparedMapRecord(stale, { allowOutdatedAnalysis: true })).toBe(stale);
  });

  it('rejects invalid embedded editor metadata instead of silently analyzing a new mapId', async () => {
    const invalid = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><metadata id="age-of-paper-map">{"schemaVersion":1}</metadata><rect id="land_a" width="10" height="10"/></svg>';
    await expect(prepareSvgMap(invalid)).rejects.toMatchObject({ code: 'INVALID_EDITOR_METADATA' });
  });

  it('requires an explicit reanalysis for previous-version metadata and preserves a requested mapId', async () => {
    const prepared = await prepareSvgMap('<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle id="island" data-terrain="land" cx="50" cy="50" r="30"/></svg>', { mapId: 'map_stable' });
    const stale = prepared.preparedSvg.replaceAll('terrain-grid-v2', 'terrain-grid-v1');
    await expect(prepareSvgMap(stale)).rejects.toMatchObject({ code: 'INVALID_EDITOR_METADATA' });
    const repaired = await prepareSvgMap(stale, { mapId: 'map_stable', forceReanalysis: true });
    expect(repaired.mapId).toBe('map_stable');
    expect(repaired.metadataStatus).toBe('forced_reanalysis');
    expect(repaired.terrainDocument.analysisAlgorithmVersion).toBe('terrain-grid-v2');
  });

  it('keeps automatic economy non-zero when prepared SVG regions omit price metadata', async () => {
    const prepared = await prepareSvgMap(`<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
      <rect id="land_a" data-terrain="land" width="50" height="50"/>
      <rect id="water_1" data-terrain="ocean" x="50" width="50" height="50"/>
    </svg>`);
    expect(prepared.mapDefinition.regionsById.land_a.price).toBeGreaterThan(0);
    expect(prepared.mapDefinition.regionsById.land_a.income).toBeGreaterThan(0);
  });

  it('preserves explicit land and compatibility sea metadata through terrain preparation', async () => {
    const prepared = await prepareSvgMap(`<svg viewBox="0 0 300 100" xmlns="http://www.w3.org/2000/svg">
      <rect id="land_a" data-terrain="land" data-neighbors="land_b" data-sea-neighbors="land_b" width="50" height="100"/>
      <rect id="water_1" data-terrain="ocean" x="50" width="200" height="100"/>
      <rect id="land_b" data-terrain="land" data-neighbors="land_a" data-sea-neighbors="land_a" x="250" width="50" height="100"/>
    </svg>`);
    expect(prepared.mapDefinition.regionsById.land_a.claimNeighbors).toEqual(['land_b']);
    expect(prepared.mapDefinition.regionsById.land_b.landNeighbors).toEqual(['land_a']);
    expect(prepared.mapDefinition.regionsById.land_a.seaNeighbors).toEqual(['land_b']);
    expect(prepared.validation.valid).toBe(true);
    const reimported = await prepareSvgMap(prepared.preparedSvg);
    expect(reimported.mapDefinition).toEqual(prepared.mapDefinition);
  });

  it('does not silently accept invalid terrain editor hints', async () => {
    const prepared = await prepareSvgMap(`<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
      <rect id="land_a" data-terrain="land" data-price="not-a-number" data-port-allowed="maybe" width="50" height="50"/>
      <rect id="water_1" data-terrain="ocean" x="50" width="50" height="50"/>
    </svg>`);
    expect(prepared.validation.valid).toBe(false);
    expect(prepared.validation.errors.map((item) => item.code)).toEqual(expect.arrayContaining(['INVALID_NUMBER', 'INVALID_PORT_ALLOWED']));
  });
});
