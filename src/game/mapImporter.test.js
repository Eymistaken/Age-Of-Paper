import { describe, expect, it } from 'vitest';
import { importSvgMap } from './mapImporter';

describe('SVG map importer', () => {
  it('prefers explicit regions, removes decoration and sanitizes unsafe content', () => {
    const svg = `
      <svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
        <script>alert(1)</script>
        <defs><path id="template" d="M0 0 L5 0 L5 5 Z" /></defs>
        <rect id="water" class="water" width="100" height="50" />
        <path id="north.east" data-region="true" data-name="Kuzey" data-price="4000" data-income="700" data-neighbors="south" onclick="evil()" d="M0 0 L50 0 L50 50 L0 50 Z" />
        <path id="south" data-region="true" data-name="Güney" data-price="5000" data-income="800" data-neighbors="north.east" d="M50 0 L100 0 L100 50 L50 50 Z" />
        <image href="https://example.com/tracker.png" />
      </svg>`;
    const result = importSvgMap(svg);
    expect(result.mapDefinition.regionIds).toEqual(['north_east', 'south']);
    expect(result.mapDefinition.pricingVersion).toBe(2);
    expect(result.mapDefinition.geometryVersion).toBe(2);
    expect(result.mapDefinition.boundsSpace).toBe('viewBox');
    expect(result.mapDefinition.regionsById.north_east).toMatchObject({ price: 4000, income: 700 });
    expect(result.mapDefinition.regionsById.south).toMatchObject({ price: 5000, income: 800 });
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
});
