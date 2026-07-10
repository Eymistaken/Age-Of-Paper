function parseNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validBounds(bounds) {
  return bounds
    && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    && bounds.width > 0
    && bounds.height > 0;
}

function hasTransformContext(element) {
  let current = element;
  while (current && current.tagName?.toLowerCase() !== 'svg') {
    if (current.hasAttribute?.('transform') || /(?:^|;)\s*transform\s*:/i.test(current.getAttribute?.('style') || '')) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function boundsFromPoints(points) {
  const numbers = String(points || '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) || [];
  if (numbers.length < 4 || numbers.length % 2 !== 0) return null;
  const xs = [];
  const ys = [];
  for (let index = 0; index < numbers.length; index += 2) {
    xs.push(numbers[index]);
    ys.push(numbers[index + 1]);
  }
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

export function basicShapeBounds(element) {
  if (!element || hasTransformContext(element)) return null;
  const tag = element.tagName.toLowerCase();
  let bounds = null;
  if (tag === 'rect') {
    bounds = {
      x: parseNumber(element.getAttribute('x')),
      y: parseNumber(element.getAttribute('y')),
      width: parseNumber(element.getAttribute('width')),
      height: parseNumber(element.getAttribute('height')),
    };
  } else if (tag === 'circle' || tag === 'ellipse') {
    const cx = parseNumber(element.getAttribute('cx'));
    const cy = parseNumber(element.getAttribute('cy'));
    const rx = tag === 'circle'
      ? parseNumber(element.getAttribute('r'))
      : parseNumber(element.getAttribute('rx'));
    const ry = tag === 'circle' ? rx : parseNumber(element.getAttribute('ry'));
    bounds = { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
  } else if (tag === 'polygon' || tag === 'polyline') {
    bounds = boundsFromPoints(element.getAttribute('points'));
  }
  return validBounds(bounds) ? bounds : null;
}

export function applyMatrixToBounds(bounds, matrix, measurementScale = 1) {
  const points = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ].map(([x, y]) => ({
    x: (matrix.a * x + matrix.c * y + matrix.e) / measurementScale,
    y: (matrix.b * x + matrix.d * y + matrix.f) / measurementScale,
  }));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function browserMeasuredBounds(svg, regionIds, viewBox, hostDocument) {
  if (!hostDocument?.body || typeof hostDocument.createElement !== 'function') return new Map();
  const host = hostDocument.createElement('div');
  const maxDimension = Math.max(viewBox.width, viewBox.height);
  const measurementScale = maxDimension > 2048 ? 2048 / maxDimension : 1;
  host.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    'visibility:hidden',
    'pointer-events:none',
    'overflow:visible',
    'contain:layout style',
  ].join(';');

  const clone = hostDocument.importNode
    ? hostDocument.importNode(svg, true)
    : svg.cloneNode(true);
  clone.setAttribute('width', String(viewBox.width * measurementScale));
  clone.setAttribute('height', String(viewBox.height * measurementScale));
  clone.style.display = 'block';
  clone.style.overflow = 'visible';
  host.appendChild(clone);
  hostDocument.body.appendChild(host);

  const elements = new Map(
    [...clone.querySelectorAll('[data-region-id]')]
      .map((element) => [element.getAttribute('data-region-id'), element]),
  );
  const measured = new Map();
  try {
    for (const regionId of regionIds) {
      const element = elements.get(regionId);
      if (!element || typeof element.getBBox !== 'function') continue;
      try {
        const localBounds = element.getBBox();
        const matrix = typeof element.getCTM === 'function' ? element.getCTM() : null;
        const bounds = matrix
          ? applyMatrixToBounds(localBounds, matrix, measurementScale)
          : (!hasTransformContext(element) ? localBounds : null);
        if (validBounds(bounds)) measured.set(regionId, bounds);
      } catch {
        // Some SVG engines throw for detached or non-renderable graphics.
      }
    }
  } finally {
    host.remove();
  }
  return measured;
}

export function measureRegionGeometry(svg, records, viewBox, hostDocument = globalThis.document) {
  const measured = browserMeasuredBounds(svg, records.map((record) => record.id), viewBox, hostDocument);
  const boundsById = new Map();
  const unmeasuredIds = [];
  for (const record of records) {
    const bounds = measured.get(record.id) || basicShapeBounds(record.element);
    if (validBounds(bounds)) boundsById.set(record.id, bounds);
    else unmeasuredIds.push(record.id);
  }
  return { boundsById, unmeasuredIds };
}

export function boundsArea(bounds) {
  return validBounds(bounds) ? bounds.width * bounds.height : null;
}
