export const POINTER_MODES = Object.freeze({
  IDLE: 'idle',
  PRESS_PENDING: 'press-pending',
  PANNING: 'panning',
  PINCHING: 'pinching',
});

const MOUSE_THRESHOLD = 6;
const TOUCH_THRESHOLD = 9;

export function createMapPointerState() {
  return {
    mode: POINTER_MODES.IDLE,
    pointers: {},
    primaryId: null,
    selectionRegionId: null,
  };
}

function normalizePointer(input) {
  return {
    pointerId: input.pointerId,
    pointerType: input.pointerType || 'mouse',
    button: input.button ?? 0,
    startX: input.x,
    startY: input.y,
    x: input.x,
    y: input.y,
    regionId: input.regionId || null,
  };
}

function isAcceptedPointer(pointer) {
  return pointer.pointerType !== 'mouse' || pointer.button === 0;
}

export function beginMapPointer(state, input) {
  const pointer = normalizePointer(input);
  if (!isAcceptedPointer(pointer) || state.pointers[pointer.pointerId]) {
    return { state, accepted: false, captureIds: [], startedPinch: false };
  }
  const pointers = { ...state.pointers, [pointer.pointerId]: pointer };
  const pointerIds = Object.keys(pointers).map(Number);
  if (pointerIds.length === 1) {
    return {
      state: {
        mode: POINTER_MODES.PRESS_PENDING,
        pointers,
        primaryId: pointer.pointerId,
        selectionRegionId: pointer.regionId,
      },
      accepted: true,
      captureIds: [],
      startedPinch: false,
    };
  }
  return {
    state: {
      mode: POINTER_MODES.PINCHING,
      pointers,
      primaryId: null,
      selectionRegionId: null,
    },
    accepted: true,
    captureIds: pointerIds,
    startedPinch: true,
  };
}

export function moveMapPointer(state, input) {
  const existing = state.pointers[input.pointerId];
  if (!existing) {
    return { state, accepted: false, captureIds: [], startedPan: false, delta: null };
  }
  const pointer = { ...existing, x: input.x, y: input.y };
  const pointers = { ...state.pointers, [input.pointerId]: pointer };
  if (state.mode === POINTER_MODES.PRESS_PENDING) {
    const threshold = pointer.pointerType === 'mouse' ? MOUSE_THRESHOLD : TOUCH_THRESHOLD;
    const distance = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
    if (distance < threshold) {
      return { state: { ...state, pointers }, accepted: true, captureIds: [], startedPan: false, delta: null };
    }
    return {
      state: { ...state, mode: POINTER_MODES.PANNING, pointers, selectionRegionId: null },
      accepted: true,
      captureIds: [pointer.pointerId],
      startedPan: true,
      delta: { x: pointer.x - pointer.startX, y: pointer.y - pointer.startY },
    };
  }
  const delta = state.mode === POINTER_MODES.PANNING
    ? { x: pointer.x - pointer.startX, y: pointer.y - pointer.startY }
    : null;
  return { state: { ...state, pointers }, accepted: true, captureIds: [], startedPan: false, delta };
}

export function endMapPointer(state, pointerId, { cancelled = false } = {}) {
  if (!state.pointers[pointerId]) {
    return { state, accepted: false, selectionRegionId: null, releaseIds: [] };
  }
  const pointers = { ...state.pointers };
  delete pointers[pointerId];
  const remaining = Object.values(pointers);
  const selectionRegionId = !cancelled && state.mode === POINTER_MODES.PRESS_PENDING
    ? state.selectionRegionId
    : null;
  if (state.mode === POINTER_MODES.PINCHING && remaining.length === 1) {
    const pointer = remaining[0];
    const resetPointer = { ...pointer, startX: pointer.x, startY: pointer.y, regionId: null };
    return {
      state: {
        mode: POINTER_MODES.PANNING,
        pointers: { [resetPointer.pointerId]: resetPointer },
        primaryId: resetPointer.pointerId,
        selectionRegionId: null,
      },
      accepted: true,
      selectionRegionId: null,
      releaseIds: [pointerId],
      continuedPan: true,
    };
  }
  if (remaining.length === 0) {
    return {
      state: createMapPointerState(),
      accepted: true,
      selectionRegionId,
      releaseIds: [pointerId],
      continuedPan: false,
    };
  }
  return {
    state: { ...state, pointers },
    accepted: true,
    selectionRegionId: null,
    releaseIds: [pointerId],
    continuedPan: false,
  };
}
