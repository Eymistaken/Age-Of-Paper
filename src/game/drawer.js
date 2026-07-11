const SNAP_ORDER = ['compact', 'half', 'expanded'];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getDrawerSnapPoints({ height, hudBottom = 64, safeBottom = 0 }) {
  const viewportHeight = Math.max(280, Number(height) || 0);
  const maximum = Math.max(210, viewportHeight - Math.max(0, hudBottom) - 48);
  const compact = Math.min(maximum - 64, clamp(viewportHeight * 0.34, 180, 340));
  const expanded = Math.min(maximum, Math.max(compact + 64, viewportHeight * 0.72 - safeBottom));
  return {
    compact: Math.round(compact),
    half: Math.round((compact + expanded) / 2),
    expanded: Math.round(expanded),
  };
}

export function pickDrawerSnap({ height, velocity = 0, snaps, flingThreshold = 0.55 }) {
  const currentIndex = SNAP_ORDER.reduce((best, name, index) => (
    Math.abs(snaps[name] - height) < Math.abs(snaps[SNAP_ORDER[best]] - height) ? index : best
  ), 0);
  if (Math.abs(velocity) < flingThreshold) return SNAP_ORDER[currentIndex];
  const direction = velocity > 0 ? 1 : -1;
  return SNAP_ORDER[clamp(currentIndex + direction, 0, SNAP_ORDER.length - 1)];
}

export function clampDrawerHeight(height, snaps) {
  return clamp(height, snaps.compact, snaps.expanded);
}
