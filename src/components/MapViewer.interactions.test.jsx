import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapViewer } from './MapViewer';

const region = {
  id: 'california', name: 'California', price: 5000, income: 500,
  claimNeighbors: [], bounds: { x: 10, y: 10, width: 30, height: 20 },
};
const roomData = {
  mapSvg: '<svg viewBox="0 0 100 60"><rect data-region="true" data-region-id="california" id="california" x="10" y="10" width="30" height="20"/></svg>',
  mapDefinition: {
    viewBox: { x: 0, y: 0, width: 100, height: 60 },
    regionIds: ['california'],
    regionsById: { california: region },
  },
  claims: {}, players: {}, lastAction: null, turnOrder: [], turnIndex: 0,
};

function pointerEvent(type, overrides = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const values = {
    pointerId: 1, pointerType: 'mouse', button: 0,
    clientX: 100, clientY: 100,
    ...overrides,
  };
  Object.entries(values).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
  return event;
}

let container;
let root;
let setSelectedId;
let mapRef;

async function renderMap() {
  await act(async () => {
    root.render(
      <MapViewer
        ref={mapRef}
        roomData={roomData}
        roomCode="ABCD"
        selectedId={null}
        setSelectedId={setSelectedId}
        legalClaims={['california']}
        localPlayerId="me"
        leaveRoom={() => {}}
      />,
    );
  });
  const map = container.querySelector('.aop-map-viewer');
  Object.defineProperty(map, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }),
  });
  map.setPointerCapture = vi.fn();
  map.releasePointerCapture = vi.fn();
  await act(async () => mapRef.current.setVisibleMapRect({ x: 0, y: 0, width: 800, height: 600 }));
  return map;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  setSelectedId = vi.fn();
  mapRef = createRef();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('MapViewer pointer interactions', () => {
  it('selects on mouse press/release without eager pointer capture', async () => {
    const map = await renderMap();
    const mapRegion = container.querySelector('[data-region-id="california"]');
    await act(async () => {
      mapRegion.dispatchEvent(pointerEvent('pointerdown'));
      expect(map.setPointerCapture).not.toHaveBeenCalled();
      map.dispatchEvent(pointerEvent('pointerup'));
    });
    expect(setSelectedId).toHaveBeenCalledOnce();
    expect(setSelectedId).toHaveBeenCalledWith('california');
  });

  it('allows 3px mouse jitter but captures and pans above threshold', async () => {
    const map = await renderMap();
    const mapRegion = container.querySelector('[data-region-id="california"]');
    await act(async () => {
      mapRegion.dispatchEvent(pointerEvent('pointerdown'));
      map.dispatchEvent(pointerEvent('pointermove', { clientX: 103, clientY: 102 }));
      map.dispatchEvent(pointerEvent('pointerup', { clientX: 103, clientY: 102 }));
    });
    expect(setSelectedId).toHaveBeenCalledWith('california');
    setSelectedId.mockClear();
    await act(async () => {
      mapRegion.dispatchEvent(pointerEvent('pointerdown'));
      map.dispatchEvent(pointerEvent('pointermove', { clientX: 112 }));
      expect(map.setPointerCapture).toHaveBeenCalledWith(1);
      map.dispatchEvent(pointerEvent('pointerup', { clientX: 112 }));
    });
    expect(setSelectedId).not.toHaveBeenCalled();
  });

  it('uses the stored down-target even when pointerup is delivered to the captured container', async () => {
    const map = await renderMap();
    const mapRegion = container.querySelector('[data-region-id="california"]');
    await act(async () => {
      mapRegion.dispatchEvent(pointerEvent('pointerdown'));
      map.dispatchEvent(pointerEvent('pointerup'));
    });
    expect(setSelectedId).toHaveBeenCalledWith('california');
  });

  it('does not select blank map, HUD/zoom controls, or non-primary mouse buttons', async () => {
    const map = await renderMap();
    const mapRegion = container.querySelector('[data-region-id="california"]');
    await act(async () => {
      map.dispatchEvent(pointerEvent('pointerdown'));
      map.dispatchEvent(pointerEvent('pointerup'));
      const zoom = container.querySelector('[aria-label="Yakınlaştır"]');
      zoom.dispatchEvent(pointerEvent('pointerdown'));
      zoom.dispatchEvent(pointerEvent('pointerup'));
      zoom.click();
      for (const button of [1, 2]) {
        mapRegion.dispatchEvent(pointerEvent('pointerdown', { button }));
        mapRegion.dispatchEvent(pointerEvent('pointerup', { button }));
      }
    });
    expect(setSelectedId).not.toHaveBeenCalled();
  });

  it('selects a touch tap but not touch pan or pinch ghost release', async () => {
    const map = await renderMap();
    const mapRegion = container.querySelector('[data-region-id="california"]');
    await act(async () => {
      mapRegion.dispatchEvent(pointerEvent('pointerdown', { pointerType: 'touch' }));
      map.dispatchEvent(pointerEvent('pointerup', { pointerType: 'touch' }));
    });
    expect(setSelectedId).toHaveBeenCalledWith('california');
    setSelectedId.mockClear();
    await act(async () => {
      mapRegion.dispatchEvent(pointerEvent('pointerdown', { pointerType: 'touch' }));
      map.dispatchEvent(pointerEvent('pointermove', { pointerType: 'touch', clientX: 115 }));
      map.dispatchEvent(pointerEvent('pointerup', { pointerType: 'touch', clientX: 115 }));
      mapRegion.dispatchEvent(pointerEvent('pointerdown', { pointerType: 'touch' }));
      map.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 140 }));
      map.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, pointerType: 'touch', clientX: 140 }));
      map.dispatchEvent(pointerEvent('pointerup', { pointerType: 'touch' }));
    });
    expect(setSelectedId).not.toHaveBeenCalled();
  });
});
