import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapViewer } from './MapViewer';

const regions = {
  a: {
    id: 'a', name: 'A', price: 5000, income: 500,
    claimNeighbors: [], bounds: { x: 80, y: 180, width: 100, height: 80 },
  },
  b: {
    id: 'b', name: 'B', price: 5000, income: 500,
    claimNeighbors: [], bounds: { x: 680, y: 220, width: 80, height: 70 },
  },
};
const mapSvg = '<svg viewBox="0 0 1000 500"><rect data-region="true" data-region-id="a" id="a" x="80" y="180" width="100" height="80"/><rect data-region="true" data-region-id="b" id="b" x="680" y="220" width="80" height="70"/></svg>';

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

function mockSvgGeometry({ rootMatrix = new Matrix(), matrices = {}, unavailable = false } = {}) {
  const svg = container.querySelector('.aop-map-viewer svg');
  if (!svg) return;
  svg.getScreenCTM = () => (unavailable ? null : rootMatrix);
  svg.querySelectorAll('[data-region-id]').forEach((element) => {
    const id = element.getAttribute('data-region-id');
    element.getBBox = () => ({
      x: Number(element.getAttribute('x')),
      y: Number(element.getAttribute('y')),
      width: Number(element.getAttribute('width')),
      height: Number(element.getAttribute('height')),
    });
    element.getScreenCTM = () => (unavailable ? null : rootMatrix.multiply(matrices[id] || new Matrix()));
  });
}

function room(overrides = {}) {
  return {
    mapSvg,
    mapDefinition: {
      viewBox: { x: 0, y: 0, width: 1000, height: 500 },
      regionIds: ['a', 'b'],
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

async function renderRoom(roomData, {
  geometry = {},
  visibleRect = { x: 0, y: 0, width: 800, height: 600 },
  containerRect = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 },
} = {}) {
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
  mockSvgGeometry(geometry);
  const map = container.querySelector('.aop-map-viewer');
  Object.defineProperty(map, 'getBoundingClientRect', {
    configurable: true,
    value: () => containerRect,
  });
  map.setPointerCapture = vi.fn();
  map.releasePointerCapture = vi.fn();
  await act(async () => {
    mapRef.current.setVisibleMapRect(visibleRect);
    await vi.advanceTimersByTimeAsync(20);
  });
  return map;
}

function cameraFromTransform(rect) {
  const transform = container.querySelector('.aop-map-transform').style.transform;
  const match = transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px, 0(?:px)?\) scale\(([-\d.]+)\)/);
  if (!match) throw new Error(`Beklenmeyen kamera transformu: ${transform}`);
  const [, x, y, scale] = match.map(Number);
  return {
    focusX: (rect.x + rect.width / 2 - x) / scale,
    focusY: (rect.y + rect.height / 2 - y) / scale,
    scale,
  };
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
  it('focuses the live claimed region instead of a disagreeing stored bound', async () => {
    const initial = room();
    const map = await renderRoom(initial);
    await makeUserCamera(map);
    await renderRoom(room({
      mapDefinition: {
        ...initial.mapDefinition,
        geometryVersion: 2,
        boundsSpace: 'viewBox',
        regionsById: {
          ...regions,
          b: { ...regions.b, bounds: { x: 10, y: 10, width: 30, height: 30 } },
        },
      },
      claims: { b: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'b', actionId: '4:claim:other:b', turnNumber: 4 },
    }));
    await advance(500);
    const focused = cameraFromTransform({ x: 0, y: 0, width: 800, height: 600 });
    expect(focused.focusX).toBeCloseTo(720, 5);
    expect(focused.focusY).toBeCloseTo(255, 5);
  });

  it('uses transformed root-viewBox bounds for the exact claimed region', async () => {
    const transformedSvg = '<svg viewBox="100 50 1000 500"><rect data-region="true" data-region-id="a" x="120" y="180" width="100" height="80"/><g transform="translate(600 100) scale(2)"><rect data-region="true" data-region-id="b" x="10" y="20" width="40" height="30"/></g></svg>';
    const transformedRoom = room({
      mapSvg: transformedSvg,
      mapDefinition: {
        viewBox: { x: 100, y: 50, width: 1000, height: 500 },
        regionIds: ['a', 'b'],
        regionsById: { a: regions.a, b: { ...regions.b, bounds: null } },
      },
    });
    const map = await renderRoom(transformedRoom, {
      geometry: { matrices: { b: new Matrix(2, 0, 0, 2, 600, 100) } },
    });
    await makeUserCamera(map);
    await renderRoom({
      ...transformedRoom,
      claims: { b: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'b', actionId: '4:claim:other:b', turnNumber: 4 },
    }, {
      geometry: { matrices: { b: new Matrix(2, 0, 0, 2, 600, 100) } },
    });
    await advance(500);
    const focused = cameraFromTransform({ x: 0, y: 0, width: 800, height: 600 });
    expect(focused.focusX).toBeCloseTo(660, 5);
    expect(focused.focusY).toBeCloseTo(170, 5);
  });

  it('uses the same strict transformed target bounds for a remote attack', async () => {
    const transformedSvg = '<svg viewBox="100 50 1000 500"><rect data-region="true" data-region-id="a" x="120" y="180" width="100" height="80"/><g transform="translate(600 100) scale(2)"><rect data-region="true" data-region-id="b" x="10" y="20" width="40" height="30"/></g></svg>';
    const transformedRoom = room({
      mapSvg: transformedSvg,
      mapDefinition: {
        viewBox: { x: 100, y: 50, width: 1000, height: 500 },
        regionIds: ['a', 'b'],
        regionsById: { a: regions.a, b: { ...regions.b, bounds: null } },
      },
    });
    const geometry = { matrices: { b: new Matrix(2, 0, 0, 2, 600, 100) } };
    const map = await renderRoom(transformedRoom, { geometry });
    const baseTransform = await makeUserCamera(map);
    await renderRoom({
      ...transformedRoom,
      lastAction: { type: 'land_attack', actorId: 'other', sourceId: 'a', targetId: 'b', amount: 1000, actionId: '4:land_attack:other:b', turnNumber: 4 },
    }, { geometry });
    await advance(500);
    const focused = cameraFromTransform({ x: 0, y: 0, width: 800, height: 600 });
    expect(focused.focusX).toBeCloseTo(660, 5);
    expect(focused.focusY).toBeCloseTo(170, 5);
    await advance(1400);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(baseTransform);
  });

  it('skips invalid legacy bounds instead of focusing the map default', async () => {
    const map = await renderRoom(room());
    const baseTransform = await makeUserCamera(map);
    await renderRoom(room({
      claims: { b: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'b', actionId: '4:claim:other:b', turnNumber: 4 },
    }), { geometry: { unavailable: true } });
    await advance(2000);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(baseTransform);
  });

  it('retries a region mounted one frame late and then focuses its live bounds', async () => {
    const map = await renderRoom(room());
    await makeUserCamera(map);
    await renderRoom(room({
      claims: { b: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'b', actionId: '4:claim:other:b', turnNumber: 4 },
    }), { geometry: { unavailable: true } });
    mockSvgGeometry();
    await advance(500);
    const focused = cameraFromTransform({ x: 0, y: 0, width: 800, height: 600 });
    expect(focused.focusX).toBeCloseTo(720, 5);
    expect(focused.focusY).toBeCloseTo(255, 5);
  });

  it('focuses the same region on mobile without fitting the whole map', async () => {
    const mobileRect = { x: 0, y: 72, width: 390, height: 280 };
    const map = await renderRoom(room(), { visibleRect: mobileRect });
    await makeUserCamera(map);
    await renderRoom(room({
      claims: { b: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'b', actionId: '4:claim:other:b', turnNumber: 4 },
    }), { visibleRect: mobileRect });
    await advance(500);
    const focused = cameraFromTransform(mobileRect);
    expect(focused.focusX).toBeCloseTo(720, 5);
    expect(focused.focusY).toBeCloseTo(255, 5);
    expect(focused.scale).toBeGreaterThan(1);
  });

  it('restores the exact user camera and does not chain a local-turn fit', async () => {
    const map = await renderRoom(room());
    const baseTransform = await makeUserCamera(map);
    await renderRoom(room({
      turnIndex: 0,
      turnNumber: 5,
      claims: { b: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'b', actionId: '4:claim:other:b', turnNumber: 4 },
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
      lastAction: { type: 'claim', actorId: 'me', regionId: 'b', actionId: '5:claim:me:b', turnNumber: 5 },
    }));
    await advance(2000);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(baseTransform);
  });

  it('cancels pending restore when the user wheels during focus', async () => {
    const map = await renderRoom(room());
    await makeUserCamera(map);
    await renderRoom(room({
      claims: { b: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'b', actionId: '4:claim:other:b', turnNumber: 4 },
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
      claims: { b: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'b', actionId: '4:claim:other:b', turnNumber: 4 },
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
      claims: { a: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'a', actionId: '5:claim:other:a', turnNumber: 5 },
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
      claims: { b: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'b', actionId: '4:claim:other:b', turnNumber: 4 },
    }));
    await advance(180);
    await act(async () => container.querySelector('[aria-label="Yakınlaştır"]').click());
    const zoomedTransform = container.querySelector('.aop-map-transform').style.transform;
    await advance(3000);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(zoomedTransform);

    await renderRoom(room({
      claims: { a: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'a', actionId: '5:claim:other:a', turnNumber: 5 },
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
      claims: { b: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'b', actionId: '4:claim:other:b', turnNumber: 4 },
    }));
    await advance(500);
    await renderRoom(room({
      claims: { a: { ownerId: 'other' }, b: { ownerId: 'other' } },
      lastAction: { type: 'claim', actorId: 'other', regionId: 'a', actionId: '5:claim:other:a', turnNumber: 5 },
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
      lastAction: { type: 'claim', actorId: 'other', regionId: 'b', actionId: 'old-claim', turnNumber: 3 },
    }));
    const transform = await makeUserCamera(map);
    await advance(1000);
    expect(container.querySelector('.aop-map-transform').style.transform).toBe(transform);
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(container);
  });
});
