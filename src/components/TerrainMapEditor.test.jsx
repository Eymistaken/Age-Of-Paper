import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareSvgMap } from '../game/mapImporter';
import { openMapRepository } from '../services/mapRepository';
import { TerrainMapEditor } from './TerrainMapEditor';

const svg = '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><rect id="land_a" data-terrain="land" width="50" height="50"/><rect id="water_1" data-terrain="ocean" x="50" width="50" height="50"/></svg>';

function pointerEvent(type, target, overrides = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.entries({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10, ctrlKey: false, ...overrides })
    .forEach(([key, value]) => Object.defineProperty(event, key, { value }));
  target.dispatchEvent(event);
}

let container;
let root;
let repository;
let prepared;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  repository = await openMapRepository({ indexedDB: null });
  prepared = await prepareSvgMap(svg, { displayName: 'Editör Testi' });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(async () => {
  vi.useRealTimers();
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderEditor(overrides = {}) {
  const onClose = overrides.onClose || vi.fn();
  const onApply = overrides.onApply || vi.fn();
  const onDraftChange = overrides.onDraftChange;
  await act(async () => {
    root.render(<TerrainMapEditor initialRecord={prepared} repository={repository} onApply={onApply} onClose={onClose} onDraftChange={onDraftChange} readOnly={overrides.readOnly || false} />);
  });
  return { onApply, onClose };
}

async function selectLandAndClassify(label = 'Göl') {
  const land = document.querySelector('.aop-terrain-art #land_a');
  await act(async () => { pointerEvent('pointerdown', land); pointerEvent('pointerup', land); });
  const button = [...document.querySelectorAll('.aop-terrain-choice-grid button')].find((candidate) => candidate.textContent === label);
  await act(async () => button.click());
}

async function settlePromises() {
  for (let index = 0; index < 10; index += 1) {
    await vi.runAllTimersAsync();
    for (let tick = 0; tick < 50; tick += 1) await Promise.resolve();
  }
}

describe('terrain map editor workspace', () => {
  it('opens non-host room maps read-only with naval settings visible', async () => {
    const save = vi.spyOn(repository, 'savePreparedMap');
    const { onApply } = await renderEditor({ readOnly: true });
    expect(document.body.textContent).toContain('Salt okunur oda haritası');
    expect(document.body.textContent).not.toContain('Odaya Uygula');
    expect(document.querySelector('[aria-label="Harita görünen adı"]').readOnly).toBe(true);
    await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Ayarlar').click());
    expect(document.querySelector('.aop-editor-inspector-wrap').classList.contains('is-open')).toBe(true);
    await act(async () => [...document.querySelectorAll('[role="tab"]')].find((button) => button.textContent === 'Deniz Erişimi').click());
    expect(document.body.textContent).toContain('Salt okunur görünüm');
    expect(document.querySelector('[aria-label="Deniz politikası"]').disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
  it('traps the page in an accessible full-screen dialog and restores overflow', async () => {
    document.body.style.overflow = 'clip';
    await renderEditor();
    expect(document.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    await act(async () => root.unmount());
    expect(document.body.style.overflow).toBe('clip');
    root = createRoot(container);
  });

  it('supports H/V/B shortcuts and standard replacement selection clicks', async () => {
    await renderEditor();
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true })));
    expect([...document.querySelectorAll('.aop-editor-tools button')].find((button) => button.textContent.includes('Fırça')).getAttribute('aria-pressed')).toBe('true');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true })));
    const land = document.querySelector('.aop-terrain-art #land_a');
    const water = document.querySelector('.aop-terrain-art #water_1');
    await act(async () => { pointerEvent('pointerdown', land); pointerEvent('pointerup', land); });
    expect(document.querySelector('.aop-selection-bar strong').textContent).toContain('1 yüzey');
    await act(async () => { pointerEvent('pointerdown', water); pointerEvent('pointerup', water); });
    expect(document.querySelector('.aop-selection-bar strong').textContent).toContain('1 yüzey');
    expect(water.getAttribute('data-editor-selected')).toBe('true');
    expect(land.hasAttribute('data-editor-selected')).toBe(false);
  });

  it('clears the inspected surface when Ctrl toggles it out of the selection', async () => {
    await renderEditor();
    const land = document.querySelector('.aop-terrain-art #land_a');
    await act(async () => { pointerEvent('pointerdown', land); pointerEvent('pointerup', land); });
    expect(document.querySelector('.aop-surface-facts h3').textContent).toBe('land a');
    await act(async () => { pointerEvent('pointerdown', land, { ctrlKey: true }); pointerEvent('pointerup', land, { ctrlKey: true }); });
    expect(document.querySelector('.aop-selection-bar')).toBeNull();
    expect(document.querySelector('.aop-surface-facts')).toBeNull();
  });

  it('does not save on open or unchanged close', async () => {
    vi.useFakeTimers();
    const save = vi.spyOn(repository, 'savePreparedMap');
    const { onClose, onApply } = await renderEditor();
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(save).not.toHaveBeenCalled();
    await act(async () => document.querySelector('[aria-label="Harita editörünü kapat"]').click());
    expect(save).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('performs one debounced upsert per edit despite parent callback rerenders', async () => {
    vi.useFakeTimers();
    const save = vi.spyOn(repository, 'savePreparedMap');
    const onClose = vi.fn();
    function Harness() {
      const [, setRevision] = useState(0);
      return <TerrainMapEditor initialRecord={prepared} repository={repository} onApply={vi.fn()} onClose={onClose} onDraftChange={() => setRevision((value) => value + 1)} />;
    }
    await act(async () => root.render(<Harness />));
    await selectLandAndClassify();
    expect(document.body.textContent).toContain('Kaydedilmemiş değişiklikler');
    await act(async () => vi.advanceTimersByTimeAsync(649));
    expect(save).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(save).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('Yerel olarak kaydedildi');
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(save).toHaveBeenCalledOnce();
  });

  it('cancels the pending upsert when undo returns to the saved document', async () => {
    vi.useFakeTimers();
    const save = vi.spyOn(repository, 'savePreparedMap');
    await renderEditor();
    await selectLandAndClassify();
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })));
    expect(document.body.textContent).toContain('Yerel olarak kaydedildi');
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(save).not.toHaveBeenCalled();
  });

  it('flushes manually, preserves identity, and remains recoverable after a save failure', async () => {
    vi.useFakeTimers();
    const originalSave = repository.savePreparedMap.bind(repository);
    const save = vi.spyOn(repository, 'savePreparedMap')
      .mockRejectedValueOnce(Object.assign(new Error('quota'), { name: 'QuotaExceededError' }))
      .mockImplementation(originalSave);
    await renderEditor();
    const originalIdentity = { mapId: prepared.mapId, createdAt: prepared.createdAt };
    await selectLandAndClassify();
    await act(async () => { document.querySelector('[aria-label="Taslağı hemen yerel olarak kaydet"]').click(); await settlePromises(); });
    expect(document.body.textContent).toContain('Yerel kayıt başarısız');
    expect(save).toHaveBeenCalledOnce();
    await act(async () => {
      document.querySelector('[aria-label="Taslağı hemen yerel olarak kaydet"]').click();
      await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2), { timeout: 1_000, interval: 1 });
    });
    expect(document.body.textContent).toContain('Yerel olarak kaydedildi');
    const stored = await repository.getPreparedMap(prepared.mapId);
    expect(stored).toMatchObject(originalIdentity);
    expect(stored.terrainDocument.surfacesById.land_a.hostOverride).toBe('lake');
  });

  it('flushes a changed close into the same record and never applies remotely', async () => {
    vi.useFakeTimers();
    const save = vi.spyOn(repository, 'savePreparedMap');
    const { onApply, onClose } = await renderEditor();
    await selectLandAndClassify();
    await act(async () => { document.querySelector('[aria-label="Harita editörünü kapat"]').click(); await settlePromises(); });
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0]).toMatchObject({ mapId: prepared.mapId, createdAt: prepared.createdAt });
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    prepared = await repository.getPreparedMap(prepared.mapId);
    await act(async () => root.unmount());
    root = createRoot(container);
    await renderEditor();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(save).toHaveBeenCalledOnce();
    const land = document.querySelector('.aop-terrain-art #land_a');
    await act(async () => { pointerEvent('pointerdown', land); pointerEvent('pointerup', land); });
    expect(document.querySelector('.aop-surface-facts').textContent).toContain('Göl');
  });

  it('starts a viewBox marquee over synthetic water after the threshold without a ghost click', async () => {
    prepared = await prepareSvgMap('<svg viewBox="10 20 100 50" xmlns="http://www.w3.org/2000/svg"><g transform="translate(10 0)"><rect id="land_a" data-terrain="land" width="30" height="50"/></g></svg>', { displayName: 'Marquee' });
    await renderEditor();
    const canvas = document.querySelector('.aop-terrain-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50, x: 0, y: 0 });
    const water = document.querySelector('.aop-synthetic-water');
    expect(water).not.toBeNull();
    await act(async () => {
      pointerEvent('pointerdown', water, { clientX: 90, clientY: 45 });
      pointerEvent('pointermove', canvas, { clientX: 15, clientY: 5 });
    });
    expect(document.querySelector('.aop-marquee')).not.toBeNull();
    await act(async () => pointerEvent('pointerup', canvas, { clientX: 15, clientY: 5 }));
    expect(document.querySelector('.aop-selection-bar strong').textContent).toMatch(/[1-9]/);
    expect(document.querySelector('.aop-marquee')).toBeNull();
  });

  it('crosses the remote boundary only through the explicit Odaya Uygula action', async () => {
    vi.useFakeTimers();
    const onApply = vi.fn(async () => {});
    await renderEditor({ onApply });
    expect(onApply).not.toHaveBeenCalled();
    await act(async () => {
      [...document.querySelectorAll('button')].find((button) => button.textContent === 'Odaya Uygula').click();
      await vi.waitFor(() => expect(onApply).toHaveBeenCalledOnce(), { timeout: 1_000, interval: 1 });
    });
  });

  it('repairs a previous-version draft from originalSvg while preserving its stable identity', async () => {
    const originalSvg = `<svg viewBox="100 50 200 100" xmlns="http://www.w3.org/2000/svg">
      <polygon id="R-1" points="100,50 300,50 300,150 100,150"/><circle id="R-1" cx="200" cy="100" r="3"/>
    </svg>`;
    const previous = await prepareSvgMap(`<svg viewBox="100 50 200 100" xmlns="http://www.w3.org/2000/svg">
      <polygon id="R-1" data-terrain="land" points="100,50 300,50 300,150 100,150"/>
      <circle id="R-1_2" data-terrain="land" cx="200" cy="100" r="3"/>
    </svg>`, { mapId: 'map_stable_reset', displayName: 'Eski Taslak' });
    prepared = {
      ...previous,
      originalSvg,
      terrainDocument: { ...previous.terrainDocument, analysisAlgorithmVersion: 'terrain-grid-v1' },
      mapDefinition: { ...previous.mapDefinition, analysisAlgorithmVersion: 'terrain-grid-v1' },
    };
    const createdAt = prepared.createdAt;
    await renderEditor();
    expect(document.body.textContent).toContain('önceki analiz sürümünü');
    expect([...document.querySelectorAll('button')].find((button) => button.textContent === 'Odaya Uygula').disabled).toBe(true);
    await act(async () => {
      [...document.querySelectorAll('button')].find((button) => button.textContent === 'Analizi Sıfırla').click();
      await vi.waitFor(async () => {
        const stored = await repository.getPreparedMap('map_stable_reset');
        expect(stored?.terrainDocument.analysisAlgorithmVersion).toBe('terrain-grid-v2');
      });
    });
    const repaired = await repository.getPreparedMap('map_stable_reset');
    expect(repaired).toMatchObject({ mapId: 'map_stable_reset', createdAt, originalSvg });
    expect(repaired.mapDefinition.regionIds).toEqual(['R-1']);
    expect(repaired.validation.valid).toBe(true);
    const base = new DOMParser().parseFromString(repaired.baseSvg, 'image/svg+xml');
    expect(base.querySelector('polygon').id).toBe('R-1');
    expect(base.querySelector('circle').id).toMatch(/^aop_aux_R-1_/);
  });

  it('uses a low-confidence row to replace selection, highlight, inspect and reveal without editing terrain', async () => {
    prepared = await prepareSvgMap('<svg viewBox="0 0 1000 100" xmlns="http://www.w3.org/2000/svg"><rect id="alpha" x="0" width="80" height="100"/><rect id="omega" x="920" width="80" height="100"/></svg>', { displayName: 'Review' });
    await renderEditor();
    const zoomIn = document.querySelector('[aria-label="Yakınlaştır"]');
    await act(async () => { zoomIn.click(); zoomIn.click(); });
    const artSvg = document.querySelector('.aop-terrain-art > svg');
    const beforeViewBox = artSvg.getAttribute('viewBox');
    const omegaRow = [...document.querySelectorAll('.aop-review-surface')].find((row) => row.dataset.surfaceId === 'omega');
    expect(omegaRow).toBeDefined();
    const terrainBefore = document.querySelector('.aop-terrain-art #omega').getAttribute('data-editor-terrain');
    await act(async () => omegaRow.click());
    expect(omegaRow.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.aop-terrain-art #omega').getAttribute('data-editor-selected')).toBe('true');
    expect(document.querySelector('.aop-surface-facts h3').textContent).toBe('omega');
    expect(artSvg.getAttribute('viewBox')).not.toBe(beforeViewBox);
    expect(document.querySelector('.aop-terrain-art #omega').getAttribute('data-editor-terrain')).toBe(terrainBefore);
    expect(document.querySelector('[aria-label="Geri al"]').disabled).toBe(true);
  });

  it.each([['desktop', 1280], ['mobile', 390]])('opens and focuses terrain classification controls on %s', async (_label, viewportWidth) => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewportWidth });
    Element.prototype.scrollIntoView.mockClear();
    await renderEditor();
    const land = document.querySelector('.aop-terrain-art #land_a');
    await act(async () => { pointerEvent('pointerdown', land); pointerEvent('pointerup', land); });
    await act(async () => [...document.querySelectorAll('[role="tab"]')].find((button) => button.textContent === 'Kıyılar ve Limanlar').click());
    const action = [...document.querySelectorAll('.aop-selection-bar button')].find((button) => button.textContent === 'Seçileni Sınıflandır');
    await act(async () => action.click());
    expect(document.querySelector('.aop-editor-inspector-wrap').classList.contains('is-open')).toBe(true);
    expect([...document.querySelectorAll('[role="tab"]')].find((button) => button.textContent === 'Arazi Analizi').getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('.aop-classification-panel').classList.contains('is-emphasized')).toBe(true);
    expect(document.activeElement.textContent).toBe('Kara');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1_400));
    expect(document.querySelector('.aop-classification-panel').classList.contains('is-emphasized')).toBe(false);
  });

  it('classifies every selected surface as one undoable command', async () => {
    await renderEditor();
    const land = document.querySelector('.aop-terrain-art #land_a');
    const water = document.querySelector('.aop-terrain-art #water_1');
    await act(async () => { pointerEvent('pointerdown', land); pointerEvent('pointerup', land); });
    await act(async () => { pointerEvent('pointerdown', water, { ctrlKey: true }); pointerEvent('pointerup', water, { ctrlKey: true }); });
    expect(document.querySelector('.aop-selection-bar strong').textContent).toContain('2 yüzey');
    await act(async () => [...document.querySelectorAll('.aop-selection-bar button')].find((button) => button.textContent === 'Seçileni Sınıflandır').click());
    await act(async () => [...document.querySelectorAll('.aop-terrain-choice-grid button')].find((button) => button.textContent === 'Göl').click());
    expect(land.getAttribute('data-editor-terrain')).toBe('lake');
    expect(water.getAttribute('data-editor-terrain')).toBe('lake');
    await act(async () => document.querySelector('[aria-label="Geri al"]').click());
    expect(land.getAttribute('data-editor-terrain')).toBe('land');
    expect(water.getAttribute('data-editor-terrain')).toBe('ocean');
  });

  it('shares the explanatory boundary-ring action and clears stale analysis on replacement', async () => {
    await renderEditor();
    const land = document.querySelector('.aop-terrain-art #land_a');
    const water = document.querySelector('.aop-terrain-art #water_1');
    await act(async () => { pointerEvent('pointerdown', land); pointerEvent('pointerup', land); });
    expect(document.body.textContent).toContain('bitişik yüzeylerden oluşan bağlı bir halka');
    const ringActions = [...document.querySelectorAll('button')].filter((button) => button.textContent === 'Seçimi Sınır Halkası Olarak Analiz Et');
    expect(ringActions).toHaveLength(2);
    await act(async () => ringActions[0].click());
    expect(document.querySelector('.aop-boundary-result [role="alert"]').textContent).toContain('2 seçili komşu');
    await act(async () => { pointerEvent('pointerdown', water); pointerEvent('pointerup', water); });
    expect(document.querySelector('.aop-boundary-result')).toBeNull();
    expect(document.querySelector('.aop-surface-facts h3').textContent).toBe('water 1');
  });

  it('handles Ctrl+Z/Y before browser history and follows the Escape hierarchy', async () => {
    const { onClose } = await renderEditor();
    const land = document.querySelector('.aop-terrain-art #land_a');
    await act(async () => { pointerEvent('pointerdown', land); pointerEvent('pointerup', land); });
    const lakeButton = [...document.querySelectorAll('.aop-terrain-choice-grid button')].find((button) => button.textContent === 'Göl');
    await act(async () => lakeButton.click());
    const undoEvent = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => document.dispatchEvent(undoEvent));
    expect(undoEvent.defaultPrevented).toBe(true);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
