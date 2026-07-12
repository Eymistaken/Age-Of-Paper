import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveTerrainDocument } from '../game/terrainModel';
import { TerrainInspector } from './TerrainInspector';

let container;
let root;

const documentValue = deriveTerrainDocument({
  mapId: 'map_inspector',
  displayName: 'Inspector',
  revision: 1,
  viewBox: { x: 0, y: 0, width: 100, height: 50 },
  surfaces: [
    {
      id: 'land_a', name: 'Kara A', elementId: 'land_a',
      automatic: { terrainType: 'land', confidence: 0.42, evidence: ['weak_fill'] },
      metadataTerrainType: 'land', adjacentSurfaceIds: ['water_1'], portPreference: false,
    },
    {
      id: 'water_1', name: 'Su 1', elementId: 'water_1',
      automatic: { terrainType: 'ocean', confidence: 0.9, evidence: ['boundary'] },
      metadataTerrainType: 'ocean', adjacentSurfaceIds: ['land_a'],
    },
  ],
});

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderInspector(selectedIds = [], inspectedId = null, overrides = {}) {
  await act(async () => root.render(
    <TerrainInspector
      document={overrides.document || documentValue}
      selectedIds={selectedIds}
      inspectedId={inspectedId}
      onClassify={vi.fn()}
      onReset={vi.fn()}
      onPortChange={vi.fn()}
      onAnalyzeBoundary={vi.fn()}
      boundaryPreview={null}
      onApplyBoundaryBatch={vi.fn()}
      onReviewSurface={overrides.onReviewSurface || vi.fn()}
      section={overrides.section}
      onSectionChange={overrides.onSectionChange}
      classificationFocusRequest={overrides.classificationFocusRequest || 0}
    />,
  ));
}

describe('terrain inspector responsibility split', () => {
  it('shows analysis-specific empty and selected states without coast controls', async () => {
    await renderInspector();
    expect(container.textContent).toContain('Düşük güvenli yüzeyler');
    expect(container.textContent).toContain('Analiz ayrıntıları için bir yüzey seç');
    expect(container.textContent).not.toContain('Bu kıyıda liman kurulabilir');

    await renderInspector(['land_a'], 'land_a');
    expect(container.textContent).toContain('Otomatik tahmin');
    expect(container.textContent).toContain('Güven');
    expect(container.textContent).toContain('Sınıflandırma kaynağı');
    expect(container.textContent).toContain('Komşu kara');
    expect(container.textContent).not.toContain('Liman izni');
  });

  it('shows coast/port-specific empty and selected states without analysis facts or a second legend', async () => {
    await renderInspector();
    await act(async () => [...container.querySelectorAll('[role="tab"]')].find((button) => button.textContent === 'Kıyılar ve Limanlar').click());
    expect(container.textContent).toContain('Liman kurulabilir kıyılar');
    expect(container.textContent).toContain('Kıyı ayrıntıları için bir kara yüzeyi seç');
    expect(container.querySelectorAll('.aop-terrain-legend')).toHaveLength(0);

    await renderInspector(['land_a'], 'land_a');
    await act(async () => [...container.querySelectorAll('[role="tab"]')].find((button) => button.textContent === 'Kıyılar ve Limanlar').click());
    expect(container.textContent).toContain('Temas eden su');
    expect(container.textContent).toContain('Liman izni');
    expect(container.textContent).toContain('Devre dışı');
    expect(container.textContent).not.toContain('Otomatik tahmin');
  });

  it('renders the complete sorted low-confidence review list as pressed keyboard buttons', async () => {
    const surfaces = [
      { id: 'z', name: 'Zemin', automatic: { terrainType: 'land', confidence: 0.4 }, adjacentSurfaceIds: [] },
      { id: 'b', name: 'Ada', automatic: { terrainType: 'land', confidence: 0.2 }, adjacentSurfaceIds: [] },
      { id: 'a', name: 'Ada', automatic: { terrainType: 'land', confidence: 0.2 }, adjacentSurfaceIds: [] },
      ...Array.from({ length: 7 }, (_, index) => ({
        id: `extra_${index}`, name: `Yüzey ${index}`, automatic: { terrainType: 'land', confidence: 0.3 + index / 100 }, adjacentSurfaceIds: [],
      })),
    ];
    const reviewDocument = deriveTerrainDocument({
      mapId: 'map_review', displayName: 'Review', revision: 1,
      viewBox: { x: 0, y: 0, width: 100, height: 50 }, surfaces,
    });
    const onReviewSurface = vi.fn();
    const onSectionChange = vi.fn();
    await renderInspector(['a'], 'a', { document: reviewDocument, onReviewSurface, onSectionChange });
    const rows = [...container.querySelectorAll('.aop-review-surface')];
    expect(rows).toHaveLength(10);
    expect(rows.map((row) => row.dataset.surfaceId)).toEqual(['a', 'b', 'extra_0', 'extra_1', 'extra_2', 'extra_3', 'extra_4', 'extra_5', 'extra_6', 'z']);
    expect(rows[0].tagName).toBe('BUTTON');
    expect(rows[0].getAttribute('aria-pressed')).toBe('true');
    expect(rows[0].textContent).toContain('Seçili');
    rows.at(-1).focus();
    expect(document.activeElement).toBe(rows.at(-1));
    await act(async () => rows.at(-1).click());
    expect(onSectionChange).toHaveBeenCalledWith('terrain');
    expect(onReviewSurface).toHaveBeenCalledWith('z');
  });
});
