import { act } from 'react';
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
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderEditor(overrides = {}) {
  const onClose = overrides.onClose || vi.fn();
  await act(async () => {
    root.render(<TerrainMapEditor initialRecord={prepared} repository={repository} onApply={vi.fn()} onClose={onClose} />);
  });
  return { onClose };
}

describe('terrain map editor workspace', () => {
  it('traps the page in an accessible full-screen dialog and restores overflow', async () => {
    document.body.style.overflow = 'clip';
    await renderEditor();
    expect(document.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    await act(async () => root.unmount());
    expect(document.body.style.overflow).toBe('clip');
    root = createRoot(container);
  });

  it('supports H/V/B shortcuts and the exact clear-without-replace selection click', async () => {
    await renderEditor();
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true })));
    expect([...document.querySelectorAll('.aop-editor-tools button')].find((button) => button.textContent.includes('Fırça')).getAttribute('aria-pressed')).toBe('true');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true })));
    const land = document.querySelector('.aop-terrain-art #land_a');
    const water = document.querySelector('.aop-terrain-art #water_1');
    await act(async () => { pointerEvent('pointerdown', land); pointerEvent('pointerup', land); });
    expect(document.querySelector('.aop-selection-bar strong').textContent).toContain('1 yüzey');
    await act(async () => { pointerEvent('pointerdown', water); pointerEvent('pointerup', water); });
    expect(document.querySelector('.aop-selection-bar')).toBeNull();
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
