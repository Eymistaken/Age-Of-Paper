import { describe, expect, it } from 'vitest';
import { lowConfidenceReviewSurfaces } from './terrainReview';

describe('low-confidence terrain review', () => {
  it('returns every low automatic-confidence surface in deterministic confidence/name/id order', () => {
    const surfaces = [
      { id: 'z', name: 'Zemin', automatic: { confidence: 0.4 } },
      { id: 'b', name: 'Ada', automatic: { confidence: 0.2 } },
      { id: 'a', name: 'Ada', automatic: { confidence: 0.2 } },
      ...Array.from({ length: 8 }, (_, index) => ({ id: `extra_${index}`, name: `Yüzey ${index}`, automatic: { confidence: 0.3 + index / 100 } })),
      { id: 'safe', name: 'Güvenli', automatic: { confidence: 0.9 } },
    ];
    expect(lowConfidenceReviewSurfaces({ surfaces }).map((surface) => surface.id)).toEqual([
      'a', 'b', 'extra_0', 'extra_1', 'extra_2', 'extra_3', 'extra_4', 'extra_5', 'extra_6', 'extra_7', 'z',
    ]);
  });
});
