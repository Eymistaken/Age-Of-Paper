import { describe, expect, it } from 'vitest';
import {
  applyMatrixToBounds,
  basicShapeBounds,
  boundsArea,
  isStoredRegionBoundsTrusted,
  measureElementBoundsInRootViewBox,
  resolveRegionBoundsInRootViewBox,
} from './svgGeometry';

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

function measured(localBounds, rootMatrix, relativeMatrix = new Matrix()) {
  const root = { getScreenCTM: () => rootMatrix };
  const element = {
    getBBox: () => localBounds,
    getScreenCTM: () => rootMatrix.multiply(relativeMatrix),
  };
  return measureElementBoundsInRootViewBox(element, root);
}

function expectBoundsClose(actual, expected) {
  Object.entries(expected).forEach(([key, value]) => expect(actual[key]).toBeCloseTo(value, 8));
}

function elementFrom(svg) {
  return new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement.firstElementChild;
}

describe('SVG geometry helpers', () => {
  it('supports primitive region shapes without a browser SVG layout engine', () => {
    expect(basicShapeBounds(elementFrom('<svg><rect x="5" y="7" width="20" height="10"/></svg>')))
      .toEqual({ x: 5, y: 7, width: 20, height: 10 });
    expect(basicShapeBounds(elementFrom('<svg><circle cx="10" cy="10" r="5"/></svg>')))
      .toEqual({ x: 5, y: 5, width: 10, height: 10 });
    expect(basicShapeBounds(elementFrom('<svg><ellipse cx="10" cy="20" rx="4" ry="8"/></svg>')))
      .toEqual({ x: 6, y: 12, width: 8, height: 16 });
    expect(basicShapeBounds(elementFrom('<svg><polygon points="0,0 20,0 10,15"/></svg>')))
      .toEqual({ x: 0, y: 0, width: 20, height: 15 });
    expect(basicShapeBounds(elementFrom('<svg><polyline points="2,3 8,9"/></svg>')))
      .toEqual({ x: 2, y: 3, width: 6, height: 6 });
  });

  it('applies the browser CTM to local getBBox bounds', () => {
    const transformed = applyMatrixToBounds(
      { x: 0, y: 0, width: 10, height: 5 },
      { a: 2, b: 0, c: 0, d: 3, e: 20, f: 30 },
    );
    expect(transformed).toEqual({ x: 20, y: 30, width: 20, height: 15 });
    expect(boundsArea(transformed)).toBe(300);
  });

  it('measures a normal region directly in root viewBox coordinates', () => {
    expect(measured(
      { x: 10, y: 20, width: 30, height: 40 },
      new Matrix(2, 0, 0, 2, 15, 25),
    )).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('preserves non-zero viewBox coordinates instead of rebasing them to zero', () => {
    expect(measured(
      { x: 120, y: 70, width: 30, height: 20 },
      new Matrix(2, 0, 0, 2, -200, -100),
    )).toEqual({ x: 120, y: 70, width: 30, height: 20 });
  });

  it('includes translated, scaled, and nested ancestor transforms', () => {
    const rootMatrix = new Matrix(1.5, 0, 0, 1.5, 20, 40);
    const group = new Matrix(2, 0, 0, 3, 30, 40);
    expectBoundsClose(measured(
      { x: 5, y: 10, width: 20, height: 10 }, rootMatrix, group,
    ), { x: 40, y: 70, width: 40, height: 30 });

    const nested = group.multiply(new Matrix(1, 0, 0, 1, 7, -4));
    expectBoundsClose(measured(
      { x: 5, y: 10, width: 20, height: 10 }, rootMatrix, nested,
    ), { x: 54, y: 58, width: 40, height: 30 });
  });

  it('transforms all four corners for rotated regions', () => {
    expectBoundsClose(measured(
      { x: 0, y: 0, width: 10, height: 20 },
      new Matrix(3, 0, 0, 3, 100, 50),
      new Matrix(0, 1, -1, 0, 100, 20),
    ), { x: 80, y: 20, width: 20, height: 10 });
  });

  it('produces the same world bounds at desktop and mobile CSS scales', () => {
    const local = { x: 10, y: 15, width: 25, height: 30 };
    const relative = new Matrix(1.2, 0, 0, 1.2, 300, 80);
    const desktop = measured(local, new Matrix(2, 0, 0, 2, 10, 20), relative);
    const mobile = measured(local, new Matrix(0.45, 0, 0, 0.45, 4, 70), relative);
    expectBoundsClose(mobile, desktop);
    expectBoundsClose(desktop, { x: 312, y: 98, width: 30, height: 36 });
  });

  it('trusts stored bounds only with viewBox metadata and plausible map overlap', () => {
    const mapBounds = { x: 100, y: 50, width: 1000, height: 500 };
    const stored = { x: 680, y: 220, width: 80, height: 70 };
    expect(isStoredRegionBoundsTrusted(stored, mapBounds, {})).toBe(false);
    expect(isStoredRegionBoundsTrusted(
      { x: 0, y: 0, width: 20, height: 20 }, mapBounds,
      { geometryVersion: 1, boundsSpace: 'local' },
    )).toBe(false);
    expect(isStoredRegionBoundsTrusted(
      stored, mapBounds, { geometryVersion: 2, boundsSpace: 'viewBox' },
    )).toBe(true);
    expect(isStoredRegionBoundsTrusted(
      { x: -5000, y: -5000, width: 20, height: 20 }, mapBounds,
      { geometryVersion: 2, boundsSpace: 'viewBox' },
    )).toBe(false);
  });

  it('prefers live root-viewBox bounds when stored bounds disagree', () => {
    const mapBounds = { x: 0, y: 0, width: 1000, height: 500 };
    const rootMatrix = new Matrix(0.5, 0, 0, 0.5, 10, 20);
    const rootSvg = { getScreenCTM: () => rootMatrix };
    const element = {
      getBBox: () => ({ x: 10, y: 20, width: 40, height: 30 }),
      getScreenCTM: () => rootMatrix.multiply(new Matrix(2, 0, 0, 2, 600, 100)),
    };
    expect(resolveRegionBoundsInRootViewBox({
      element,
      rootSvg,
      storedBounds: { x: 20, y: 20, width: 40, height: 30 },
      mapBounds,
      metadata: { geometryVersion: 2, boundsSpace: 'viewBox' },
      allowStored: true,
    })).toEqual({ x: 620, y: 140, width: 80, height: 60 });
  });

  it('returns null instead of guessing when neither live nor stored bounds are trustworthy', () => {
    expect(resolveRegionBoundsInRootViewBox({
      element: { getBBox: () => ({ x: 0, y: 0, width: 10, height: 10 }), getScreenCTM: () => null },
      rootSvg: { getScreenCTM: () => null },
      storedBounds: { x: 0, y: 0, width: 10, height: 10 },
      mapBounds: { x: 100, y: 50, width: 1000, height: 500 },
      metadata: {},
      allowStored: true,
    })).toBeNull();
  });

  it('does not reinterpret raw path parameters as x/y pairs', () => {
    const path = elementFrom('<svg><path d="m 10 10 h 20 v 20 a 900 700 0 1 1 50 50 z"/></svg>');
    expect(basicShapeBounds(path)).toBeNull();
  });

  it('requires browser measurement when a transform is present', () => {
    const rect = elementFrom('<svg><rect transform="scale(20)" width="10" height="10"/></svg>');
    expect(basicShapeBounds(rect)).toBeNull();
  });
});
