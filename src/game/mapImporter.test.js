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
    expect(wideViewport.importer).toBe('legacy-svg-v1');
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
