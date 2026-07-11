import { describe, expect, it, vi } from 'vitest';
import { createCameraAnimator, interpolateCamera } from './cameraAnimator';

const cameraA = { focusX: 100, focusY: 200, scale: 2, anchorX: 0.5, anchorY: 0.5 };
const cameraB = { focusX: 700, focusY: 400, scale: 0.5, anchorX: 0.5, anchorY: 0.5 };

function fakeFrames() {
  let nextId = 0;
  const callbacks = new Map();
  return {
    requestFrame(callback) { nextId += 1; callbacks.set(nextId, callback); return nextId; },
    cancelFrame(id) { callbacks.delete(id); },
    step(time) {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(time));
    },
    count() { return callbacks.size; },
  };
}

describe('camera animator', () => {
  it('produces exact endpoints and positive geometric scale at midpoint', () => {
    expect(interpolateCamera(cameraA, cameraB, 0)).toEqual(cameraA);
    const middle = interpolateCamera(cameraA, cameraB, 0.5);
    expect(middle.focusX).toBeGreaterThan(cameraA.focusX);
    expect(middle.focusX).toBeLessThan(cameraB.focusX);
    expect(middle.scale).toBeCloseTo(1);
    expect(middle.scale).toBeGreaterThan(0);
    expect(interpolateCamera(cameraA, cameraB, 1)).toEqual(cameraB);
  });

  it('owns one rAF loop and cancellation prevents later DOM updates', () => {
    const frames = fakeFrames();
    const onFrame = vi.fn();
    const animator = createCameraAnimator({ ...frames, onFrame, now: () => 0 });
    animator.animate(cameraA, cameraB, { duration: 400 });
    expect(frames.count()).toBe(1);
    animator.animate(cameraB, cameraA, { duration: 400 });
    expect(frames.count()).toBe(1);
    frames.step(100);
    const callsBeforeCancel = onFrame.mock.calls.length;
    animator.cancel();
    frames.step(500);
    expect(onFrame).toHaveBeenCalledTimes(callsBeforeCancel);
  });

  it('reaches the target once and dispose removes pending work', () => {
    const frames = fakeFrames();
    const onFrame = vi.fn();
    const onComplete = vi.fn();
    const animator = createCameraAnimator({ ...frames, onFrame, now: () => 0 });
    animator.animate(cameraA, cameraB, { duration: 400, onComplete });
    frames.step(0);
    frames.step(200);
    frames.step(400);
    expect(onFrame).toHaveBeenLastCalledWith(cameraB);
    expect(onComplete).toHaveBeenCalledOnce();
    animator.animate(cameraB, cameraA, { duration: 400 });
    animator.dispose();
    expect(frames.count()).toBe(0);
  });
});
