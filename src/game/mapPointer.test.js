import { describe, expect, it } from 'vitest';
import {
  POINTER_MODES,
  beginMapPointer,
  createMapPointerState,
  endMapPointer,
  moveMapPointer,
} from './mapPointer';

const pointer = (overrides = {}) => ({
  pointerId: 1,
  pointerType: 'mouse',
  button: 0,
  x: 100,
  y: 100,
  regionId: 'california',
  ...overrides,
});

describe('map pointer state machine', () => {
  it('keeps a mouse press pending through 3px jitter and selects its stored region on release', () => {
    let result = beginMapPointer(createMapPointerState(), pointer());
    expect(result.state.mode).toBe(POINTER_MODES.PRESS_PENDING);
    expect(result.captureIds).toEqual([]);
    result = moveMapPointer(result.state, pointer({ x: 103, y: 102 }));
    expect(result.state.mode).toBe(POINTER_MODES.PRESS_PENDING);
    expect(result.startedPan).toBe(false);
    result = endMapPointer(result.state, 1);
    expect(result.selectionRegionId).toBe('california');
    expect(result.state.mode).toBe(POINTER_MODES.IDLE);
  });

  it('starts mouse pan only above threshold and suppresses selection', () => {
    let state = beginMapPointer(createMapPointerState(), pointer()).state;
    const moved = moveMapPointer(state, pointer({ x: 107, y: 100 }));
    expect(moved.startedPan).toBe(true);
    expect(moved.captureIds).toEqual([1]);
    expect(moved.state.mode).toBe(POINTER_MODES.PANNING);
    expect(endMapPointer(moved.state, 1).selectionRegionId).toBeNull();
  });

  it('uses a larger touch threshold and turns a second pointer into pinch', () => {
    let state = beginMapPointer(createMapPointerState(), pointer({ pointerType: 'touch' })).state;
    expect(moveMapPointer(state, pointer({ pointerType: 'touch', x: 108 })).state.mode).toBe(POINTER_MODES.PRESS_PENDING);
    const pinch = beginMapPointer(state, pointer({ pointerId: 2, pointerType: 'touch', x: 140, regionId: null }));
    expect(pinch.state.mode).toBe(POINTER_MODES.PINCHING);
    expect(pinch.captureIds).toEqual([1, 2]);
    const oneLeft = endMapPointer(pinch.state, 2);
    expect(oneLeft.state.mode).toBe(POINTER_MODES.PANNING);
    expect(endMapPointer(oneLeft.state, 1).selectionRegionId).toBeNull();
  });

  it('ignores middle and right mouse buttons', () => {
    for (const button of [1, 2]) {
      const result = beginMapPointer(createMapPointerState(), pointer({ button }));
      expect(result.accepted).toBe(false);
      expect(result.state.mode).toBe(POINTER_MODES.IDLE);
    }
  });
});
