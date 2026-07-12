import { createRoot } from 'react-dom/client';
import { prepareSvgMap } from '../../src/game/mapImporter';
import { openMapRepository } from '../../src/services/mapRepository';
import { TerrainMapEditor } from '../../src/components/TerrainMapEditor';
import '../../src/index.css';

const output = document.getElementById('smoke-result');
window.confirm = () => true;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pointer(target, type, values = {}) {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: values.pointerId || 1,
    pointerType: values.pointerType || 'mouse',
    button: 0,
    clientX: values.clientX || 300,
    clientY: values.clientY || 240,
    ctrlKey: values.ctrlKey || false,
  }));
}

async function waitFor(check, message, timeout = 2500) {
  const started = performance.now();
  while (!check()) {
    if (performance.now() - started > timeout) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function run() {
  const svg = `<svg viewBox="100 50 200 100" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(10 5)">
      <rect id="land_a" data-terrain="land" x="100" y="50" width="80" height="90" fill="#c9ad78"/>
      <rect id="water_1" data-terrain="ocean" x="180" y="50" width="110" height="90" fill="#245674"/>
    </g>
  </svg>`;
  const prepared = await prepareSvgMap(svg, { displayName: 'Browser Smoke' });
  assert(prepared.terrainDocument.viewBox.x === 100, 'non-zero viewBox lost');
  assert(prepared.terrainDocument.surfacesById.land_a.bounds.x > 100, 'nested CTM was not applied');
  assert(prepared.terrainDocument.surfacesById.land_a.coastType === 'ocean', 'coast was not derived');
  const repository = await openMapRepository();
  const root = createRoot(document.getElementById('root'));
  root.render(<TerrainMapEditor initialRecord={prepared} repository={repository} onApply={async () => {}} onClose={() => {}} />);
  await waitFor(() => document.querySelector('[role="dialog"][aria-modal="true"]'), 'editor dialog missing');
  await waitFor(() => document.body.style.overflow === 'hidden', 'body overflow not locked');
  assert(document.querySelector('[role="dialog"][aria-modal="true"]'), 'editor dialog missing');
  const land = document.querySelector('.aop-terrain-art #land_a');
  assert(land, 'normalized land element missing');
  pointer(land, 'pointerdown');
  pointer(land, 'pointerup');
  await waitFor(() => document.querySelector('.aop-selection-bar')?.textContent.includes('1 yüzey'), 'pointer selection failed');
  assert(document.querySelector('.aop-selection-bar')?.textContent.includes('1 yüzey'), 'pointer selection failed');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
  await waitFor(() => [...document.querySelectorAll('.aop-editor-tools button')].some((button) => button.textContent.includes('Fırça') && button.getAttribute('aria-pressed') === 'true'), 'brush shortcut failed');
  assert([...document.querySelectorAll('.aop-editor-tools button')].some((button) => button.textContent.includes('Fırça') && button.getAttribute('aria-pressed') === 'true'), 'brush shortcut failed');
  const canvas = document.querySelector('.aop-terrain-canvas');
  canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: 400, clientY: 250 }));
  await waitFor(() => !document.querySelector('.aop-terrain-statusbar').textContent.includes('%100'), 'viewBox zoom did not change');
  assert(!document.querySelector('.aop-terrain-statusbar').textContent.includes('%100'), 'viewBox zoom did not change');
  const wheelZoom = document.querySelector('.aop-terrain-statusbar span:nth-child(3)').textContent;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
  await waitFor(() => [...document.querySelectorAll('.aop-editor-tools button')].some((button) => button.textContent.includes('El / Kaydır') && button.getAttribute('aria-pressed') === 'true'), 'hand shortcut failed');
  pointer(canvas, 'pointerdown', { pointerId: 11, pointerType: 'touch', clientX: 160, clientY: 240 });
  pointer(canvas, 'pointerdown', { pointerId: 12, pointerType: 'touch', clientX: 240, clientY: 240 });
  pointer(canvas, 'pointermove', { pointerId: 12, pointerType: 'touch', clientX: 290, clientY: 240 });
  pointer(canvas, 'pointerup', { pointerId: 12, pointerType: 'touch', clientX: 290, clientY: 240 });
  await waitFor(() => document.querySelector('.aop-terrain-statusbar span:nth-child(3)').textContent !== wheelZoom, 'pinch zoom did not change');
  assert(document.querySelector('.aop-selection-bar')?.textContent.includes('1 yüzey'), 'pinch cleared persistent selection');
  await repository.savePreparedMap(prepared);
  assert(await repository.getPreparedMap(prepared.mapId), 'IndexedDB persistence missing');
  output.textContent = 'PASS';
  output.dataset.status = 'pass';
}

run().catch((error) => {
  output.textContent = `FAIL: ${error.message}`;
  output.dataset.status = 'fail';
  console.error(error);
});
