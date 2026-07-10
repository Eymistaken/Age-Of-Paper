function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function segmentBounds(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function boundsOverlap(a, b, tolerance = 0) {
  if (!a || !b) return false;
  return !(
    a.x + a.width + tolerance < b.x
    || b.x + b.width + tolerance < a.x
    || a.y + a.height + tolerance < b.y
    || b.y + b.height + tolerance < a.y
  );
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return distance(point, start);
  const projection = Math.max(0, Math.min(1, (
    (point.x - start.x) * dx + (point.y - start.y) * dy
  ) / lengthSquared));
  return distance(point, {
    x: start.x + projection * dx,
    y: start.y + projection * dy,
  });
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a1, a2, b1, b2) {
  const epsilon = 1e-9;
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  return (o1 * o2 < -epsilon && o3 * o4 < -epsilon)
    || (Math.abs(o1) <= epsilon && pointToSegmentDistance(b1, a1, a2) <= epsilon)
    || (Math.abs(o2) <= epsilon && pointToSegmentDistance(b2, a1, a2) <= epsilon)
    || (Math.abs(o3) <= epsilon && pointToSegmentDistance(a1, b1, b2) <= epsilon)
    || (Math.abs(o4) <= epsilon && pointToSegmentDistance(a2, b1, b2) <= epsilon);
}

function segmentDistance(a1, a2, b1, b2) {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointToSegmentDistance(a1, b1, b2),
    pointToSegmentDistance(a2, b1, b2),
    pointToSegmentDistance(b1, a1, a2),
    pointToSegmentDistance(b2, a1, a2),
  );
}

function projectedOverlap(a1, a2, b1, b2) {
  const dx = a2.x - a1.x;
  const dy = a2.y - a1.y;
  const length = Math.hypot(dx, dy);
  if (!length) return 0;
  const ux = dx / length;
  const uy = dy / length;
  const projection = (point) => (point.x - a1.x) * ux + (point.y - a1.y) * uy;
  const bStart = projection(b1);
  const bEnd = projection(b2);
  return Math.max(0, Math.min(length, Math.max(bStart, bEnd)) - Math.max(0, Math.min(bStart, bEnd)));
}

function sharedSegmentLength(a1, a2, b1, b2, tolerance, minimumParallelCosine) {
  const aLength = distance(a1, a2);
  const bLength = distance(b1, b2);
  if (!aLength || !bLength) return 0;
  if (!boundsOverlap(segmentBounds(a1, a2), segmentBounds(b1, b2), tolerance)) return 0;
  const dot = Math.abs(
    ((a2.x - a1.x) * (b2.x - b1.x) + (a2.y - a1.y) * (b2.y - b1.y))
    / (aLength * bLength),
  );
  if (dot < minimumParallelCosine || segmentDistance(a1, a2, b1, b2) > tolerance) return 0;
  return Math.min(projectedOverlap(a1, a2, b1, b2), projectedOverlap(b1, b2, a1, a2));
}

export function boundaryBounds(boundary) {
  const points = (boundary || []).flat();
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

export function transformBoundary(boundary, matrix) {
  return (boundary || []).map((line) => line.map((point) => ({
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  })));
}

export function areBoundariesAdjacent(boundaryA, boundaryB, options = {}) {
  const tolerance = Math.max(0, options.tolerance ?? 0.1);
  const minimumSharedLength = Math.max(tolerance * 2, options.minimumSharedLength ?? tolerance * 4);
  const minimumParallelCosine = options.minimumParallelCosine ?? 0.82;
  const boundsA = boundaryBounds(boundaryA);
  const boundsB = boundaryBounds(boundaryB);
  if (!boundsOverlap(boundsA, boundsB, tolerance)) return false;

  let sharedLength = 0;
  for (const lineA of boundaryA || []) {
    for (let aIndex = 1; aIndex < lineA.length; aIndex += 1) {
      let bestMatch = 0;
      for (const lineB of boundaryB || []) {
        for (let bIndex = 1; bIndex < lineB.length; bIndex += 1) {
          bestMatch = Math.max(bestMatch, sharedSegmentLength(
            lineA[aIndex - 1],
            lineA[aIndex],
            lineB[bIndex - 1],
            lineB[bIndex],
            tolerance,
            minimumParallelCosine,
          ));
        }
      }
      sharedLength += bestMatch;
      if (sharedLength >= minimumSharedLength) return true;
    }
  }
  return false;
}

export function adjacencyThresholds(viewBox) {
  const diagonal = Math.hypot(Number(viewBox?.width) || 1, Number(viewBox?.height) || 1);
  const tolerance = Math.max(diagonal * 0.00075, Number.EPSILON);
  return {
    tolerance,
    minimumSharedLength: Math.max(diagonal * 0.0015, tolerance * 4),
  };
}

export function inferBoundaryAdjacency(regionIds, boundariesById, boundsById, viewBox) {
  const graph = new Map(regionIds.map((id) => [id, new Set()]));
  const thresholds = adjacencyThresholds(viewBox);
  for (let first = 0; first < regionIds.length; first += 1) {
    const firstId = regionIds[first];
    for (let second = first + 1; second < regionIds.length; second += 1) {
      const secondId = regionIds[second];
      if (!boundsOverlap(boundsById.get(firstId), boundsById.get(secondId), thresholds.tolerance)) continue;
      if (!areBoundariesAdjacent(boundariesById.get(firstId), boundariesById.get(secondId), thresholds)) continue;
      graph.get(firstId).add(secondId);
      graph.get(secondId).add(firstId);
    }
  }
  return graph;
}
