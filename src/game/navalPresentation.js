import { focusActionKey } from './cameraFocus';

const NAVAL_ACTIONS = new Set(['naval_transfer', 'naval_attack']);

export function createNavalPresentationState(action) {
  return { processedActionKey: focusActionKey(action) };
}

export function reduceNavalPresentation(state, action) {
  const actionKey = focusActionKey(action);
  if (!actionKey || actionKey === state.processedActionKey) return { state, effect: null };
  const nextState = { processedActionKey: actionKey };
  if (!NAVAL_ACTIONS.has(action.type) || !action.sourceId || !action.targetId) return { state: nextState, effect: null };
  return {
    state: nextState,
    effect: {
      type: 'naval_presentation',
      actionId: actionKey,
      sourceId: action.sourceId,
      targetId: action.targetId,
      operation: action.type === 'naval_attack' ? 'attack' : 'transfer',
    },
  };
}

function samplePolyline(points, progress) {
  if (!points?.length) return null;
  if (points.length === 1) return { ...points[0], angle: 0 };
  const lengths = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const length = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    lengths.push(length);
    total += length;
  }
  let remaining = Math.max(0, Math.min(1, progress)) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const ratio = lengths[index] ? remaining / lengths[index] : 0;
      const first = points[index];
      const second = points[index + 1];
      return {
        x: first.x + (second.x - first.x) * ratio,
        y: first.y + (second.y - first.y) * ratio,
        angle: Math.atan2(second.y - first.y, second.x - first.x) * 180 / Math.PI,
      };
    }
    remaining -= lengths[index];
  }
  return { ...points.at(-1), angle: 0 };
}

export function sampleNavalPresentation(path, progress) {
  const segments = path?.segments || [];
  if (!segments.length) return { visible: false, opacity: 0, point: null };
  const slot = Math.min(segments.length - 1, Math.floor(Math.max(0, Math.min(0.999999, progress)) * segments.length));
  const localProgress = Math.max(0, Math.min(1, progress * segments.length - slot));
  const segment = segments[slot];
  if (segment.kind === 'remote_transition') {
    return { visible: false, opacity: localProgress < 0.5 ? 1 - localProgress * 2 : (localProgress - 0.5) * 2, point: null };
  }
  return { visible: true, opacity: 1, point: samplePolyline(segment.points, localProgress) };
}
