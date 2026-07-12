function unique(values) {
  return [...new Set(values)];
}

export function applySurfaceClick(selectedIds, surfaceId, { ctrl = false } = {}) {
  const selected = unique(selectedIds || []);
  if (ctrl) {
    if (!surfaceId) return selected;
    return selected.includes(surfaceId)
      ? selected.filter((id) => id !== surfaceId)
      : [...selected, surfaceId];
  }
  if (!surfaceId) return [];
  if (!selected.length) return [surfaceId];
  if (selected.includes(surfaceId)) return selected;
  return [];
}

export function beginBrush(selectedIds, surfaceId, { ctrl = false, mode = null } = {}) {
  const selected = unique(selectedIds || []);
  const operation = mode || (ctrl && selected.includes(surfaceId) ? 'subtract' : 'add');
  return visitBrushSurface({ selected, visited: [], mode: operation }, surfaceId);
}

export function visitBrushSurface(stroke, surfaceId) {
  if (!surfaceId || stroke.visited.includes(surfaceId)) return stroke;
  const selected = stroke.mode === 'subtract'
    ? stroke.selected.filter((id) => id !== surfaceId)
    : unique([...stroke.selected, surfaceId]);
  return { ...stroke, selected, visited: [...stroke.visited, surfaceId] };
}

export function finishBrush(stroke) {
  return stroke?.selected || [];
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a, b, c, d) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return ((abC === 0 || abD === 0) || Math.sign(abC) !== Math.sign(abD))
    && ((cdA === 0 || cdB === 0) || Math.sign(cdA) !== Math.sign(cdB));
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if (((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x) inside = !inside;
  }
  return inside;
}

export function boundaryIntersectsRect(boundary, rawRect) {
  const rect = {
    x: Math.min(rawRect.x, rawRect.x + rawRect.width),
    y: Math.min(rawRect.y, rawRect.y + rawRect.height),
    width: Math.abs(rawRect.width),
    height: Math.abs(rawRect.height),
  };
  const corners = [
    { x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height },
  ];
  const edges = corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]]);
  for (const polygon of boundary || []) {
    if (polygon.some((point) => pointInRect(point, rect))) return true;
    if (corners.some((corner) => pointInPolygon(corner, polygon))) return true;
    for (let index = 1; index < polygon.length; index += 1) {
      if (edges.some(([first, second]) => segmentsIntersect(polygon[index - 1], polygon[index], first, second))) return true;
    }
  }
  return false;
}

export function surfacesIntersectingMarquee(surfaces, rect) {
  return surfaces.filter((surface) => boundaryIntersectsRect(surface.boundary, rect)).map((surface) => surface.id);
}

export function applyMarqueeSelection(selectedIds, intersectedIds, mode = 'replace') {
  if (mode === 'add') return unique([...(selectedIds || []), ...intersectedIds]);
  if (mode === 'subtract') return (selectedIds || []).filter((id) => !intersectedIds.includes(id));
  return unique(intersectedIds);
}
