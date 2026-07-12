import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractSurfaceCandidates } from './surfaceCandidates';

class Matrix {
  constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    Object.assign(this, { a, b, c, d, e, f });
  }

  multiply(other) {
    return new Matrix(
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.e + this.c * other.f + this.e,
      this.b * other.e + this.d * other.f + this.f,
    );
  }

  inverse() {
    const determinant = this.a * this.d - this.b * this.c;
    return new Matrix(
      this.d / determinant,
      -this.b / determinant,
      -this.c / determinant,
      this.a / determinant,
      (this.c * this.f - this.d * this.e) / determinant,
      (this.b * this.e - this.a * this.f) / determinant,
    );
  }
}

function parseSvg(markup) {
  return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
}

function installGeometryMocks(screenScale = 1) {
  Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: vi.fn(function getBBox() {
    const values = String(this.getAttribute('data-test-bounds') || '').split(',').map(Number);
    if (values.length === 4 && values.every(Number.isFinite)) {
      return { x: values[0], y: values[1], width: values[2], height: values[3] };
    }
    const tag = this.tagName.toLowerCase();
    if (tag === 'circle') {
      const r = Number(this.getAttribute('r'));
      const cx = Number(this.getAttribute('cx'));
      const cy = Number(this.getAttribute('cy'));
      return { x: cx - r, y: cy - r, width: r * 2, height: r * 2 };
    }
    return { x: 0, y: 0, width: 1, height: 1 };
  }) });
  Object.defineProperty(SVGElement.prototype, 'getScreenCTM', { configurable: true, value: vi.fn(function getScreenCTM() {
    const root = new Matrix(screenScale, 0, 0, screenScale, 17, 23);
    if (this.tagName.toLowerCase() === 'svg') return root;
    const values = String(this.getAttribute('data-test-matrix') || '1,0,0,1,0,0').split(',').map(Number);
    return root.multiply(new Matrix(...values));
  }) });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete SVGElement.prototype.getBBox;
  delete SVGElement.prototype.getScreenCTM;
});

describe('shared SVG surface candidate ownership', () => {
  it('keeps a same-id small circle as visible auxiliary artwork owned by a path', () => {
    installGeometryMocks();
    const svg = parseSvg(`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path id="region.a" data-test-bounds="0,0,100,100" d="M0 0H100V100H0Z" fill="#c9ad78"/>
      <circle id="region.a" cx="50" cy="50" r="3" fill="#222"/>
    </svg>`);
    const result = extractSurfaceCandidates(svg, { viewBox: { x: 0, y: 0, width: 100, height: 100 } });
    expect(result.records.map((record) => record.id)).toEqual(['region_a']);
    expect(result.auxiliary).toHaveLength(1);
    expect(result.auxiliary[0].element.tagName.toLowerCase()).toBe('circle');
    expect(result.auxiliary[0].element.id).toMatch(/^aop_aux_region_a_/);
    expect(result.auxiliary[0].element.getAttribute('fill')).toBe('#222');
    expect(result.importIssues.filter((issue) => issue.code === 'AUXILIARY_ARTWORK')).toHaveLength(1);
    expect(result.importIssues.some((issue) => issue.code === 'DUPLICATE_ID')).toBe(false);
  });

  it('treats unmeasured same-id marker tags as auxiliary when a path is primary', () => {
    const svg = parseSvg(`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path id="shared" d="M0 0H100V100H0Z"/>
      <circle id="shared" cx="50" cy="50" style="r: 3px"/>
      <ellipse id="shared" cx="50" cy="50" style="rx: 4px; ry: 2px"/>
      <rect id="shared" x="48" y="48" style="width: 4px; height: 4px"/>
    </svg>`);
    const result = extractSurfaceCandidates(svg, { viewBox: { x: 0, y: 0, width: 100, height: 100 } });
    expect(result.records.map((record) => record.tagName)).toEqual(['path']);
    expect(result.auxiliary.map((candidate) => candidate.tagName)).toEqual(['circle', 'ellipse', 'rect']);
    expect(result.importIssues.some((issue) => issue.code === 'DUPLICATE_ID')).toBe(false);
  });

  it('keeps similarly significant duplicate paths invalid', () => {
    installGeometryMocks();
    const svg = parseSvg(`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path id="same" data-test-bounds="0,0,100,100" d="M0 0H100V100H0Z"/>
      <path id="same" data-test-bounds="0,0,100,100" d="M0 0H100V100H0Z"/>
    </svg>`);
    const result = extractSurfaceCandidates(svg, { viewBox: { x: 0, y: 0, width: 100, height: 100 } });
    expect(result.records).toHaveLength(2);
    expect(result.records.map((record) => record.id)).toEqual(['same', 'same_2']);
    expect(result.importIssues.filter((issue) => issue.code === 'DUPLICATE_ID')).toHaveLength(1);
  });

  it('assigns shared identity ownership to explicit metadata before path geometry', () => {
    installGeometryMocks();
    const svg = parseSvg(`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path id="shared" data-test-bounds="0,0,100,100" d="M0 0H100V100H0Z"/>
      <circle id="shared" data-region="true" cx="50" cy="50" r="3"/>
    </svg>`);
    const result = extractSurfaceCandidates(svg, { viewBox: { x: 0, y: 0, width: 100, height: 100 } });
    expect(result.records.find((record) => record.tagName === 'circle').id).toBe('shared');
    expect(result.records.find((record) => record.tagName === 'path').id).toBe('shared_2');
    expect(result.auxiliary).toHaveLength(0);
    expect(result.importIssues.filter((issue) => issue.code === 'DUPLICATE_ID')).toHaveLength(1);
  });

  it('preserves an explicitly marked circular region and excludes an independent semantic label', () => {
    const svg = parseSvg(`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle id="island" class="label" data-region="true" cx="25" cy="50" r="20"/>
      <circle id="city_label" class="label" cx="75" cy="50" r="3"/>
    </svg>`);
    const result = extractSurfaceCandidates(svg, { viewBox: { x: 0, y: 0, width: 100, height: 100 } });
    expect(result.records.map((record) => record.id)).toEqual(['island']);
    expect(svg.querySelector('#city_label')).not.toBeNull();
    expect(svg.querySelector('#city_label').hasAttribute('data-region-id')).toBe(false);
  });

  it('is deterministic for nested transforms, a non-zero viewBox, and different CSS scales', () => {
    const markup = `<svg viewBox="100 50 400 200" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(100 50) scale(2)">
        <path id="nested" data-test-bounds="0,0,100,80" data-test-matrix="2,0,0,2,100,50" d="M0 0H100V80H0Z"/>
        <circle id="nested" data-test-matrix="2,0,0,2,100,50" cx="50" cy="40" r="3"/>
      </g>
    </svg>`;
    installGeometryMocks(0.45);
    const first = extractSurfaceCandidates(parseSvg(markup), { viewBox: { x: 100, y: 50, width: 400, height: 200 } });
    delete SVGElement.prototype.getBBox;
    delete SVGElement.prototype.getScreenCTM;
    installGeometryMocks(3);
    const second = extractSurfaceCandidates(parseSvg(markup), { viewBox: { x: 100, y: 50, width: 400, height: 200 } });
    expect(second.records[0].id).toBe(first.records[0].id);
    Object.keys(first.records[0].bounds).forEach((key) => {
      expect(second.records[0].bounds[key]).toBeCloseTo(first.records[0].bounds[key], 10);
    });
    expect(first.records).toHaveLength(1);
    expect(first.auxiliary).toHaveLength(1);
    expect(first.records[0].bounds.x).toBeCloseTo(100, 10);
    expect(first.records[0].bounds.y).toBeCloseTo(50, 10);
    expect(first.records[0].bounds.width).toBeCloseTo(200, 10);
    expect(first.records[0].bounds.height).toBeCloseTo(160, 10);
  });
});
