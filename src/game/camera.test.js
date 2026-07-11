import { describe, expect, it } from 'vitest';
import {
  cameraForVisibleRect,
  cameraToTransform,
  clampCamera,
  fitBoundsCamera,
  fitFocusBoundsCamera,
  panCamera,
} from './camera';

const mapBounds = { x: 0, y: 0, width: 1000, height: 500 };

describe('canonical map camera', () => {
  it('fits map bounds inside the actual visible map rectangle', () => {
    const rect = { x: 0, y: 70, width: 412, height: 465 };
    const camera = fitBoundsCamera(mapBounds, rect, 12);
    const transform = cameraToTransform(camera, rect);
    expect(transform.x).toBeGreaterThanOrEqual(rect.x + 11);
    expect(transform.y).toBeGreaterThanOrEqual(rect.y + 11);
    expect(transform.x + mapBounds.width * camera.scale).toBeLessThanOrEqual(rect.x + rect.width - 11);
    expect(transform.y + mapBounds.height * camera.scale).toBeLessThanOrEqual(rect.y + rect.height - 11);
  });

  it('preserves the same world focus and scale while the drawer grows and shrinks', () => {
    const camera = { focusX: 720, focusY: 280, scale: 0.8 };
    const compact = { x: 0, y: 68, width: 412, height: 560 };
    const expanded = { x: 0, y: 68, width: 412, height: 230 };
    expect(cameraToTransform(camera, expanded)).not.toEqual(cameraToTransform(camera, compact));
    expect({ ...camera }).toEqual({ focusX: 720, focusY: 280, scale: 0.8 });
    expect(cameraToTransform(camera, compact)).toEqual(cameraToTransform(camera, compact));
  });

  it('clamps using the visible rect instead of the covered screen and still permits vertical pan', () => {
    const rect = { x: 0, y: 70, width: 360, height: 250 };
    const camera = clampCamera({ focusX: 500, focusY: -1000, scale: 1 }, mapBounds, rect);
    const transform = cameraToTransform(camera, rect);
    expect(transform.y + mapBounds.height).toBeGreaterThan(rect.y);
    const panned = panCamera(camera, { x: 0, y: -100 }, mapBounds, rect);
    expect(panned.focusY).toBeGreaterThan(camera.focusY);
  });

  it('refits portrait and landscape rectangles without changing aspect ratio', () => {
    const portrait = fitBoundsCamera(mapBounds, { x: 0, y: 68, width: 360, height: 420 }, 10);
    const landscape = fitBoundsCamera(mapBounds, { x: 0, y: 60, width: 800, height: 190 }, 10);
    expect(portrait.scale).toBeCloseTo(0.34);
    expect(landscape.scale).toBeCloseTo(0.34);
    expect(portrait.focusX).toBe(landscape.focusX);
    expect(portrait.focusY).toBe(landscape.focusY);
  });

  it('uses a changed visual viewport rectangle for a new fit', () => {
    const before = fitBoundsCamera(mapBounds, { x: 0, y: 68, width: 412, height: 600 }, 12);
    const keyboard = fitBoundsCamera(mapBounds, { x: 0, y: 68, width: 412, height: 160 }, 12);
    expect(keyboard.scale).toBeLessThan(before.scale);
  });

  it('stops automatic fitting after user pan or zoom', () => {
    const rect = { x: 0, y: 68, width: 412, height: 300 };
    const manual = { focusX: 720, focusY: 280, scale: 0.8 };
    expect(cameraForVisibleRect(manual, mapBounds, rect, true)).toMatchObject(manual);
    expect(cameraForVisibleRect(manual, mapBounds, rect, false).scale).not.toBe(manual.scale);
  });

  it('never turns invalid focus bounds into the default 1000x1000 map', () => {
    const rect = { x: 0, y: 60, width: 390, height: 280 };
    expect(fitFocusBoundsCamera(null, rect, 16)).toBeNull();
    expect(fitFocusBoundsCamera({ x: 0, y: 0, width: 0, height: 10 }, rect, 16)).toBeNull();
    expect(fitFocusBoundsCamera({ x: Number.NaN, y: 0, width: 10, height: 10 }, rect, 16)).toBeNull();
  });
});
