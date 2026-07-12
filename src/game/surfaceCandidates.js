import { measureRegionGeometry } from './svgGeometry';

export const SURFACE_SHAPE_SELECTOR = 'path,polygon,rect,circle,ellipse,polyline';

const EXCLUDED_ANCESTORS = 'defs,clipPath,mask,pattern,marker,symbol';
const TERRAIN_TYPES = new Set(['land', 'ocean', 'lake', 'ignored']);
const DECORATION_WORDS = /(^|[\s_-])(decor|decoration|background|frame|border|label|legend|centroid|anchor)([\s_-]|$)/i;
const MARKER_TAGS = new Set(['circle', 'ellipse', 'rect']);
const REGION_GEOMETRY_TAGS = new Set(['path', 'polygon']);
const MAX_MARKER_AREA_RATIO = 0.08;
const CENTROID_DISTANCE_RATIO = 0.2;

export function normalizeRegionId(value, fallback = 'region') {
  let id = String(value || fallback)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!id) id = fallback;
  if (!/^[A-Za-z_]/.test(id)) id = `region_${id}`;
  return id.slice(0, 80);
}

export function parseSurfaceViewBox(svg) {
  const values = String(svg?.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
    return { x: values[0], y: values[1], width: values[2], height: values[3] };
  }
  const width = Number(svg?.getAttribute('width'));
  const height = Number(svg?.getAttribute('height'));
  return {
    x: 0,
    y: 0,
    width: Number.isFinite(width) && width > 0 ? width : 1000,
    height: Number.isFinite(height) && height > 0 ? height : 1000,
  };
}

export function isRenderableSurfaceElement(element) {
  if (element.closest(EXCLUDED_ANCESTORS)) return false;

  const parentG = element.closest('g');
  if (parentG && (parentG.getAttribute('id') === 'points' || parentG.getAttribute('id') === 'calibration' || parentG.getAttribute('id') === 'reference')) {
    return false;
  }
  const className = element.getAttribute('class');
  if (className && /^-?\d+(?:\.\d+)?\|-?\d+(?:\.\d+)?$/.test(className.trim())) {
    return false;
  }

  const style = (element.getAttribute('style') || '').toLowerCase();
  const fill = (element.getAttribute('fill') || '').trim().toLowerCase();
  return element.getAttribute('display') !== 'none'
    && element.getAttribute('visibility') !== 'hidden'
    && Number(element.getAttribute('opacity') || 1) !== 0
    && !/(?:^|;)\s*display\s*:\s*none/.test(style)
    && !/(?:^|;)\s*visibility\s*:\s*hidden/.test(style)
    && !/(?:^|;)\s*opacity\s*:\s*0(?:\.0+)?(?:;|$)/.test(style)
    && fill !== 'none'
    && !/(?:^|;)\s*fill\s*:\s*none(?:;|$)/.test(style);
}

function isExplicitSurface(element) {
  return element.getAttribute('data-region') === 'true'
    || TERRAIN_TYPES.has(element.getAttribute('data-terrain'));
}

function isSemanticDecoration(element, explicit) {
  if (explicit) return false;
  if (element.getAttribute('data-ignore') === 'true') return true;
  const semantic = [
    element.getAttribute('id'),
    element.getAttribute('class'),
    element.getAttribute('aria-label'),
    element.getAttribute('data-name'),
  ].filter(Boolean).join(' ');
  return DECORATION_WORDS.test(semantic);
}

function area(bounds) {
  return bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    && bounds.width > 0 && bounds.height > 0
    ? bounds.width * bounds.height
    : null;
}

function containsBounds(outer, inner) {
  const tolerance = Math.hypot(outer.width, outer.height) * 0.01;
  return inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.width <= outer.x + outer.width + tolerance
    && inner.y + inner.height <= outer.y + outer.height + tolerance;
}

function nearCentroid(owner, marker) {
  const ownerCenter = { x: owner.x + owner.width / 2, y: owner.y + owner.height / 2 };
  const markerCenter = { x: marker.x + marker.width / 2, y: marker.y + marker.height / 2 };
  const distance = Math.hypot(ownerCenter.x - markerCenter.x, ownerCenter.y - markerCenter.y);
  return distance <= Math.hypot(owner.width, owner.height) * CENTROID_DISTANCE_RATIO;
}

function isCredibleMarker(candidate, owner) {
  if (candidate.explicit || !MARKER_TAGS.has(candidate.tagName)) return false;
  if (REGION_GEOMETRY_TAGS.has(owner.tagName)) return true;
  const candidateArea = area(candidate.bounds);
  const ownerArea = area(owner.bounds);
  if (candidateArea === null || ownerArea === null || candidateArea / ownerArea > MAX_MARKER_AREA_RATIO) return false;
  return containsBounds(owner.bounds, candidate.bounds) || nearCentroid(owner.bounds, candidate.bounds);
}

function chooseOtherShapeOwner(group) {
  return [...group].sort((first, second) => {
    const firstArea = area(first.bounds);
    const secondArea = area(second.bounds);
    if (firstArea !== null && secondArea !== null && firstArea !== secondArea) return secondArea - firstArea;
    if (firstArea !== null && secondArea === null) return -1;
    if (firstArea === null && secondArea !== null) return 1;
    return first.index - second.index;
  })[0];
}

function allocateId(base, usedIds) {
  let id = normalizeRegionId(base);
  let suffix = 2;
  while (usedIds.has(id)) id = `${normalizeRegionId(base).slice(0, 72)}_${suffix++}`;
  usedIds.add(id);
  return id;
}

function rewriteFragmentReferences(svg, replacements) {
  if (!replacements.size) return;
  svg.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (attribute.name === 'id') continue;
      let next = attribute.value;
      replacements.forEach((replacement, source) => {
        next = next.replaceAll(`url(#${source})`, `url(#${replacement})`);
        if (next === `#${source}`) next = `#${replacement}`;
      });
      if (next !== attribute.value) element.setAttribute(attribute.name, next);
    }
  });
}

function ownershipForGroup(group) {
  const explicit = group.filter((candidate) => candidate.explicit);
  const geometry = group.filter((candidate) => REGION_GEOMETRY_TAGS.has(candidate.tagName));
  const records = [];
  const auxiliary = [];
  const primary = explicit[0] || geometry[0] || chooseOtherShapeOwner(group);

  for (const candidate of group) {
    const protectedOwner = candidate.explicit || REGION_GEOMETRY_TAGS.has(candidate.tagName);
    if (candidate !== primary && !protectedOwner && isCredibleMarker(candidate, primary)) auxiliary.push(candidate);
    else records.push(candidate);
  }
  return { records, auxiliary, primary };
}

export function extractSurfaceCandidates(svg, { viewBox = parseSurfaceViewBox(svg), hostDocument = globalThis.document } = {}) {
  const elements = [...svg.querySelectorAll(SURFACE_SHAPE_SELECTOR)].filter(isRenderableSurfaceElement);
  const previousReferences = new Map();
  const temporaryRecords = elements.map((element, index) => {
    const temporaryId = `aop_candidate_${index + 1}`;
    previousReferences.set(element, element.getAttribute('data-region-id'));
    element.setAttribute('data-region-id', temporaryId);
    return { id: temporaryId, element };
  });
  const measured = measureRegionGeometry(svg, temporaryRecords, viewBox, hostDocument);
  elements.forEach((element) => {
    const previous = previousReferences.get(element);
    if (previous === null) element.removeAttribute('data-region-id');
    else element.setAttribute('data-region-id', previous);
  });

  const candidates = elements.map((element, index) => {
    const fallback = `surface_${index + 1}`;
    const sourceId = element.getAttribute('id') || element.getAttribute('data-region-id') || fallback;
    const explicit = isExplicitSurface(element);
    return {
      element,
      index,
      sourceId,
      identity: normalizeRegionId(sourceId, fallback),
      tagName: element.tagName.toLowerCase(),
      explicit,
      semanticDecoration: isSemanticDecoration(element, explicit),
      bounds: measured.boundsById.get(`aop_candidate_${index + 1}`) || null,
      boundary: measured.boundariesById.get(`aop_candidate_${index + 1}`) || [],
    };
  });
  const groups = new Map();
  candidates.filter((candidate) => !candidate.semanticDecoration).forEach((candidate) => {
    if (!groups.has(candidate.identity)) groups.set(candidate.identity, []);
    groups.get(candidate.identity).push(candidate);
  });

  const importIssues = [];
  const records = [];
  const auxiliary = [];
  const ownerByIdentity = new Map();
  groups.forEach((group, identity) => {
    const ownership = ownershipForGroup(group);
    records.push(...ownership.records);
    auxiliary.push(...ownership.auxiliary.map((candidate) => ({ ...candidate, ownerIdentity: identity })));
    ownerByIdentity.set(identity, ownership.primary);
    if (ownership.records.length > 1) {
      importIssues.push({
        severity: 'error',
        code: 'DUPLICATE_ID',
        message: `“${group[0].sourceId}” kimliğini paylaşan ${ownership.records.length} anlamlı SVG yüzeyi bulundu.`,
      });
    }
  });
  candidates.filter((candidate) => candidate.semanticDecoration).forEach((candidate) => {
    auxiliary.push({
      ...candidate,
      ownerIdentity: ownerByIdentity.has(candidate.identity) ? candidate.identity : null,
      semanticOnly: true,
    });
  });

  records.sort((first, second) => first.index - second.index);
  auxiliary.sort((first, second) => first.index - second.index);
  const candidateElements = new Set(elements);
  const usedIds = new Set([...svg.querySelectorAll('[id]')]
    .filter((element) => !candidateElements.has(element))
    .map((element) => element.id));
  const sourceToId = new Map();
  const idByCandidate = new Map();
  const recordSet = new Set(records);
  const ownerIdByIdentity = new Map();
  groups.forEach((group, identity) => {
    const owner = ownerByIdentity.get(identity);
    const retained = group.filter((candidate) => recordSet.has(candidate));
    const ordered = [owner, ...retained.filter((candidate) => candidate !== owner)].filter(Boolean);
    ordered.forEach((candidate) => {
      const id = allocateId(identity, usedIds);
      candidate.id = id;
      candidate.element.setAttribute('id', id);
      idByCandidate.set(candidate, id);
    });
    const ownerId = idByCandidate.get(owner);
    if (!ownerId) return;
    ownerIdByIdentity.set(identity, ownerId);
    sourceToId.set(identity, ownerId);
    sourceToId.set(owner.sourceId, ownerId);
    ordered.forEach((candidate) => {
      if (!sourceToId.has(candidate.sourceId)) sourceToId.set(candidate.sourceId, candidate.id);
    });
  });

  const auxiliaryCounts = new Map();
  auxiliary.forEach((candidate) => {
    const ownerId = candidate.ownerIdentity ? ownerIdByIdentity.get(candidate.ownerIdentity) : null;
    if (ownerId) {
      const count = (auxiliaryCounts.get(ownerId) || 0) + 1;
      auxiliaryCounts.set(ownerId, count);
      candidate.id = allocateId(`aop_aux_${ownerId}_${count}`, usedIds);
      candidate.ownerId = ownerId;
    } else if (candidate.element.hasAttribute('id')) {
      candidate.id = allocateId(candidate.identity, usedIds);
    } else {
      candidate.id = allocateId(`aop_artwork_${candidate.index + 1}`, usedIds);
    }
    candidate.element.setAttribute('id', candidate.id);
    candidate.element.removeAttribute('data-region-id');
    candidate.element.removeAttribute('data-surface-id');
  });

  const replacements = new Map();
  sourceToId.forEach((id, sourceId) => {
    if (sourceId !== id) replacements.set(sourceId, id);
  });
  rewriteFragmentReferences(svg, replacements);
  const normalizedSources = new Set();
  records.forEach((record) => {
    if (record.sourceId !== record.identity && !normalizedSources.has(record.sourceId)) {
      normalizedSources.add(record.sourceId);
      importIssues.push({
        severity: 'warning',
        code: 'NORMALIZED_ID',
        message: `“${record.sourceId}” güvenli “${sourceToId.get(record.sourceId) || record.identity}” kimliğine dönüştürüldü.`,
      });
    }
  });
  const inferredAuxiliary = auxiliary.filter((candidate) => !candidate.semanticOnly);
  if (inferredAuxiliary.length) {
    const sample = inferredAuxiliary.slice(0, 5).map((candidate) => candidate.sourceId).join(', ');
    importIssues.push({
      severity: 'warning',
      code: 'AUXILIARY_ARTWORK',
      message: `${inferredAuxiliary.length} küçük etiket/merkez işareti yüzey modelinden çıkarıldı ve SVG çizimi olarak korundu${sample ? ` (${sample})` : ''}.`,
    });
  }

  const boundsById = new Map();
  const boundariesById = new Map();
  const unmeasuredIds = [];
  const unmeasuredBoundaryIds = [];
  records.forEach((record) => {
    if (record.bounds) boundsById.set(record.id, record.bounds);
    else unmeasuredIds.push(record.id);
    if (record.boundary?.length) boundariesById.set(record.id, record.boundary);
    else unmeasuredBoundaryIds.push(record.id);
  });
  return {
    records,
    auxiliary,
    importIssues,
    sourceToId,
    geometry: { boundsById, boundariesById, unmeasuredIds, unmeasuredBoundaryIds },
  };
}
