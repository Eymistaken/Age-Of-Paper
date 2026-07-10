import { describe, expect, it } from 'vitest';
import {
  areBoundariesAdjacent,
  inferBoundaryAdjacency,
  transformBoundary,
} from './svgAdjacency';

function rectangle(x, y, width, height) {
  return [[
    { x, y }, { x: x + width, y }, { x: x + width, y: y + height },
    { x, y: y + height }, { x, y },
  ]];
}

function bounds(x, y, width, height) {
  return { x, y, width, height };
}

const options = { tolerance: 0.1, minimumSharedLength: 1 };

describe('SVG sınır komşuluğu', () => {
  it('ortak uzun kenar paylaşan bölgeleri komşu sayar', () => {
    expect(areBoundariesAdjacent(rectangle(0, 0, 10, 10), rectangle(10, 0, 10, 10), options)).toBe(true);
  });

  it('bounding box çakışsa da temas etmeyen şekilleri komşu saymaz', () => {
    const triangleA = [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 0 }]];
    const triangleB = [[{ x: 10, y: 10 }, { x: 4, y: 10 }, { x: 10, y: 4 }, { x: 10, y: 10 }]];
    expect(areBoundariesAdjacent(triangleA, triangleB, options)).toBe(false);
  });

  it('toleranstan büyük boşluğu köprülemez', () => {
    expect(areBoundariesAdjacent(rectangle(0, 0, 10, 10), rectangle(10.25, 0, 10, 10), options)).toBe(false);
  });

  it('çizim kaynaklı sub-pixel boşluğu tolere eder', () => {
    expect(areBoundariesAdjacent(rectangle(0, 0, 10, 10), rectangle(10.05, 0, 10, 10), options)).toBe(true);
  });

  it('yalnızca köşeden temas eden bölgeleri komşu saymaz', () => {
    expect(areBoundariesAdjacent(rectangle(0, 0, 10, 10), rectangle(10, 10, 10, 10), options)).toBe(false);
  });

  it('transform uygulanmış ortak sınırı bulur', () => {
    const moved = transformBoundary(rectangle(0, 0, 10, 10), { a: 1, b: 0, c: 0, d: 1, e: 10, f: 0 });
    expect(areBoundariesAdjacent(rectangle(0, 0, 10, 10), moved, options)).toBe(true);
  });

  it('iç içe bounding box’larda temas yoksa komşuluk kurmaz', () => {
    expect(areBoundariesAdjacent(rectangle(0, 0, 30, 30), rectangle(10, 10, 5, 5), options)).toBe(false);
  });

  it('grafiği simetrik üretir ve uzaktaki bölgeleri bağlamaz', () => {
    const ids = ['west', 'center', 'far'];
    const boundaries = new Map([
      ['west', rectangle(0, 0, 20, 20)],
      ['center', rectangle(20, 0, 20, 20)],
      ['far', rectangle(100, 0, 20, 20)],
    ]);
    const boxes = new Map([
      ['west', bounds(0, 0, 20, 20)],
      ['center', bounds(20, 0, 20, 20)],
      ['far', bounds(100, 0, 20, 20)],
    ]);
    const graph = inferBoundaryAdjacency(ids, boundaries, boxes, { width: 120, height: 20 });
    expect([...graph.get('west')]).toEqual(['center']);
    expect([...graph.get('center')]).toEqual(['west']);
    expect([...graph.get('far')]).toEqual([]);
  });
});
