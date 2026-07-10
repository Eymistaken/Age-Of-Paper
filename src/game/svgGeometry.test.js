import { describe, expect, it } from 'vitest';
import { applyMatrixToBounds, basicShapeBounds, boundsArea } from './svgGeometry';

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

  it('does not reinterpret raw path parameters as x/y pairs', () => {
    const path = elementFrom('<svg><path d="m 10 10 h 20 v 20 a 900 700 0 1 1 50 50 z"/></svg>');
    expect(basicShapeBounds(path)).toBeNull();
  });

  it('requires browser measurement when a transform is present', () => {
    const rect = elementFrom('<svg><rect transform="scale(20)" width="10" height="10"/></svg>');
    expect(basicShapeBounds(rect)).toBeNull();
  });
});
