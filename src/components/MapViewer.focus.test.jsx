import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapViewer } from './MapViewer';

const regions = {
  california: {
    id: 'california', name: 'California', price: 5000, income: 500,
    claimNeighbors: [], bounds: { x: 80, y: 180, width: 100, height: 80 },
  },
  texas: {
    id: 'texas', name: 'Texas', price: 5000, income: 500,
    claimNeighbors: [], bounds: { x: 680, y: 220, width: 80, height: 70 },
  },
};
const mapSvg = '<svg viewBox="0 0 1000 500"><rect data-region="true" data-region-id="california" id="california" x="80" y="180" width="100" height="80"/><rect data-region="true" data-region-id="texas" id="texas" x="680" y="220" width="80" height="70"/></svg>';

function room(overrides = {}) {
  return {
    mapSvg,
    mapDefinition: {
      viewBox: { x: 0, y: 0, width: 1000, height: 500 },
      regionIds: ['california', 'texas'],
      regionsById: regions,
    },
    claims: {},
    players: { me: { id: 'me', color: '#123', regionIds: [] }, other: { id: 'other', color: '#456', regionIds: [] } },
    lastAction: null,
    turnOrder: ['me', 'other'],
    turnIndex: 1,
    turnNumber: 4,
    ...overrides,
  };
}

function pointerEvent(type, overrides = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const values = {
    pointerId: 1, pointerType: 'mouse', button: 0,
    clientX: 200, clientY: 200,
    ...overrides,
  };
  Object.entries(values).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
  return event;
}

let container;
let root;
let mapRef;
let clock;

async function renderRoom(roomData) {
  await act(async () => {
    root.render(
      <MapViewer
        ref={mapRef}
        roomData={roomData}
        roomCode="ABCD"
        selectedId={null}
        setSelectedId={() => {}}
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
  await act(async () => {
    mapRef.current.setVisibleMapRect({ x: 0, y: 0, width: 800, height: 600 });
    await vi.advanceTimersByTimeAsync(20);
  });
  return map;
}

async function makeUserCamera(map) {
  await act(async () => {
    map.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, clientX: 160, clientY: 260, deltaY: -100,
    }));
    map.dispatchEvent(pointerEvent('pointerdown'));
    map.dispatchEvent(pointerEvent('pointermove', { clientX: 230 }));
    map.dispatchEvent(pointerEvent('pointerup', { clientX: 230 }));
  });
  return container.querySelector('.aop-map-transform').style.transform;
}

async function advance(milliseconds) {
  await act(async () => vi.advanceTimersByTimeAsync(milliseconds));
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => window.setTimeout(() => {
    clock += 16;
    callback(clock);
  }, 16));
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => window.clearTimeout(id));
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mapRef = createRef();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('MapViewer remote claim focus', () => {
  it('restores the exact user camera and does not chain a local-turn fit', async () => {
    const map = await renderRoom(room());
    const baseTransform = await makeUserCamera(map);
    await renderRoom(room({
      turnIndex: 0,
      turnNumber: 5,
      claims: { texas: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'texas', actionId: '4:claim:other:texas', turnNumber: 4 },
    }));
    await advance(500);
    expect(container.querySelector('.aop-map-transform').style.transform).not.toBe(baseTransform);
    await advance(1400);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(baseTransform);
    await advance(1000);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(baseTransform);
  });

  it('ignores remote save-income, local claim, and turn-only changes', async () => {
    const map = await renderRoom(room());
    const baseTransform = await makeUserCamera(map);
    await renderRoom(room({ turnIndex: 0, turnNumber: 5 }));
    await renderRoom(room({
      lastAction: { type: 'save_income', actorId: 'other', actionId: '4:save:other', turnNumber: 4 },
    }));
    await renderRoom(room({
      lastAction: { type: 'claim', actorId: 'me', regionId: 'texas', actionId: '5:claim:me:texas', turnNumber: 5 },
    }));
    await advance(2000);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(baseTransform);
  });

  it('cancels pending restore when the user wheels during focus', async () => {
    const map = await renderRoom(room());
    await makeUserCamera(map);
    await renderRoom(room({
      claims: { texas: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'texas', actionId: '4:claim:other:texas', turnNumber: 4 },
    }));
    await advance(200);
    await act(async () => map.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, clientX: 400, clientY: 300, deltaY: -100,
    })));
    const manualTransform = container.querySelector('.aop-map-transform').style.transform;
    await advance(3000);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(manualTransform);
  });

  it('cancels focus on real pan and pinch but not on the initial pending press', async () => {
    const map = await renderRoom(room());
    await makeUserCamera(map);
    await renderRoom(room({
      claims: { texas: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'texas', actionId: '4:claim:other:texas', turnNumber: 4 },
    }));
    await advance(160);
    const beforePress = container.querySelector('.aop-map-transform').style.transform;
    await act(async () => map.dispatchEvent(pointerEvent('pointerdown')));
    await advance(64);
    expect(container.querySelector('.aop-map-transform').style.transform).not.toBe(beforePress);
    await act(async () => {
      map.dispatchEvent(pointerEvent('pointermove', { clientX: 220 }));
      map.dispatchEvent(pointerEvent('pointerup', { clientX: 220 }));
    });
    const pannedTransform = container.querySelector('.aop-map-transform').style.transform;
    await advance(3000);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(pannedTransform);

    await renderRoom(room({
      claims: { california: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'california', actionId: '5:claim:other:california', turnNumber: 5 },
    }));
    await advance(160);
    await act(async () => {
      map.dispatchEvent(pointerEvent('pointerdown', { pointerType: 'touch' }));
      map.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 260 }));
      map.dispatchEvent(pointerEvent('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 300 }));
      map.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, pointerType: 'touch', clientX: 300 }));
      map.dispatchEvent(pointerEvent('pointerup', { pointerType: 'touch' }));
    });
    const pinchedTransform = container.querySelector('.aop-map-transform').style.transform;
    await advance(3000);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(pinchedTransform);
  });

  it('lets zoom and explicit fit controls cancel pending restore', async () => {
    const map = await renderRoom(room());
    await makeUserCamera(map);
    await renderRoom(room({
      claims: { texas: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'texas', actionId: '4:claim:other:texas', turnNumber: 4 },
    }));
    await advance(180);
    await act(async () => container.querySelector('[aria-label="Yakınlaştır"]').click());
    const zoomedTransform = container.querySelector('.aop-map-transform').style.transform;
    await advance(3000);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(zoomedTransform);

    await renderRoom(room({
      claims: { california: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'california', actionId: '5:claim:other:california', turnNumber: 5 },
    }));
    await advance(180);
    await act(async () => container.querySelector('[aria-label="Haritayı sığdır"]').click());
    const fittedTransform = container.querySelector('.aop-map-transform').style.transform;
    await advance(3000);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(fittedTransform);
  });

  it('re-renders a manual camera for visible rect changes without losing its base', async () => {
    const map = await renderRoom(room());
    const baseTransform = await makeUserCamera(map);
    await act(async () => mapRef.current.setVisibleMapRect({ x: 0, y: 60, width: 800, height: 300 }));
    expect(container.querySelector('.aop-map-transform').style.transform).not.toBe(baseTransform);
    await act(async () => mapRef.current.setVisibleMapRect({ x: 0, y: 0, width: 800, height: 600 }));
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(baseTransform);
  });

  it('keeps the original base camera across consecutive remote claims', async () => {
    const map = await renderRoom(room());
    const baseTransform = await makeUserCamera(map);
    await renderRoom(room({
      claims: { texas: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'texas', actionId: '4:claim:other:texas', turnNumber: 4 },
    }));
    await advance(500);
    await renderRoom(room({
      claims: { california: { ownerId: 'other' }, texas: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'california', actionId: '5:claim:other:california', turnNumber: 5 },
    }));
    await advance(1800);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(baseTransform);
  });

  it('does not replay an old mount action and cleans reduced-motion timers on unmount', async () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)', media: query,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
    const map = await renderRoom(room({
      lastAction: { type: 'claim', actorId: 'other', regionId: 'texas', actionId: 'old-claim', turnNumber: 3 },
    }));
    const transform = await makeUserCamera(map);
    await advance(1000);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(transform);
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(container);
  });
});
