const DEFAULT_ANCHOR = 0.5;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeBounds(bounds, fallback = { x: 0, y: 0, width: 1000, height: 1000 }) {
  const candidate = bounds || fallback;
  if (![candidate.x, candidate.y, candidate.width, candidate.height].every(Number.isFinite)
    || candidate.width <= 0 || candidate.height <= 0) return { ...fallback };
  return { x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height };
}

export function normalizeVisibleRect(rect, fallback = { x: 0, y: 0, width: 1, height: 1 }) {
  return normalizeBounds(rect, fallback);
}

export function cameraToTransform(camera, visibleRect) {
  const rect = normalizeVisibleRect(visibleRect);
  const anchorX = Number.isFinite(camera?.anchorX) ? camera.anchorX : DEFAULT_ANCHOR;
  const anchorY = Number.isFinite(camera?.anchorY) ? camera.anchorY : DEFAULT_ANCHOR;
  return {
    x: rect.x + rect.width * anchorX - camera.focusX * camera.scale,
    y: rect.y + rect.height * anchorY - camera.focusY * camera.scale,
    scale: camera.scale,
  };
}

export function fitBoundsCamera(targetBounds, visibleRect, padding = 20) {
  const bounds = normalizeBounds(targetBounds);
  const rect = normalizeVisibleRect(visibleRect);
  const horizontalPadding = Math.min(Math.max(0, padding), rect.width * 0.3);
  const verticalPadding = Math.min(Math.max(0, padding), rect.height * 0.3);
  const availableWidth = Math.max(1, rect.width - horizontalPadding * 2);
  const availableHeight = Math.max(1, rect.height - verticalPadding * 2);
  return {
    focusX: bounds.x + bounds.width / 2,
    focusY: bounds.y + bounds.height / 2,
    scale: Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
    anchorX: DEFAULT_ANCHOR,
    anchorY: DEFAULT_ANCHOR,
  };
}

export function cameraForVisibleRect(camera, mapBounds, visibleRect, userControlled, padding = 16) {
  if (userControlled && camera) return clampCamera(camera, mapBounds, visibleRect);
  return fitBoundsCamera(mapBounds, visibleRect, padding);
}

export function clampCamera(camera, mapBounds, visibleRect, minimumVisible = 48) {
  const bounds = normalizeBounds(mapBounds);
  const rect = normalizeVisibleRect(visibleRect);
  const scale = Math.max(0.0001, camera.scale);
  const anchorX = rect.x + rect.width * (camera.anchorX ?? DEFAULT_ANCHOR);
  const anchorY = rect.y + rect.height * (camera.anchorY ?? DEFAULT_ANCHOR);
  const overlapX = Math.min(minimumVisible, rect.width * 0.22, bounds.width * scale * 0.5);
  const overlapY = Math.min(minimumVisible, rect.height * 0.22, bounds.height * scale * 0.5);
  const minimumFocusX = bounds.x - ((rect.x + rect.width - overlapX) - anchorX) / scale;
  const maximumFocusX = bounds.x + bounds.width - (rect.x + overlapX - anchorX) / scale;
  const minimumFocusY = bounds.y - ((rect.y + rect.height - overlapY) - anchorY) / scale;
  const maximumFocusY = bounds.y + bounds.height - (rect.y + overlapY - anchorY) / scale;
  return {
    ...camera,
    focusX: clamp(camera.focusX, Math.min(minimumFocusX, maximumFocusX), Math.max(minimumFocusX, maximumFocusX)),
    focusY: clamp(camera.focusY, Math.min(minimumFocusY, maximumFocusY), Math.max(minimumFocusY, maximumFocusY)),
    scale,
  };
}

export function panCamera(camera, delta, mapBounds, visibleRect) {
  return clampCamera({
    ...camera,
    focusX: camera.focusX - delta.x / camera.scale,
    focusY: camera.focusY - delta.y / camera.scale,
  }, mapBounds, visibleRect);
}

export function zoomCameraAt(camera, nextScale, screenPoint, visibleRect, mapBounds) {
  const rect = normalizeVisibleRect(visibleRect);
  const transform = cameraToTransform(camera, rect);
  const worldX = (screenPoint.x - transform.x) / camera.scale;
  const worldY = (screenPoint.y - transform.y) / camera.scale;
  const anchorX = rect.x + rect.width * (camera.anchorX ?? DEFAULT_ANCHOR);
  const anchorY = rect.y + rect.height * (camera.anchorY ?? DEFAULT_ANCHOR);
  return clampCamera({
    ...camera,
    scale: nextScale,
    focusX: worldX - (screenPoint.x - anchorX) / nextScale,
    focusY: worldY - (screenPoint.y - anchorY) / nextScale,
  }, mapBounds, rect);
}

export function unionBounds(boundsList, fallback) {
  const valid = boundsList.filter((bounds) => (
    bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
      && bounds.width >= 0 && bounds.height >= 0
  ));
  if (!valid.length) return normalizeBounds(fallback);
  const left = Math.min(...valid.map((bounds) => bounds.x));
  const top = Math.min(...valid.map((bounds) => bounds.y));
  const right = Math.max(...valid.map((bounds) => bounds.x + bounds.width));
  const bottom = Math.max(...valid.map((bounds) => bounds.y + bounds.height));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}
