import { normalizeRegionId, sanitizeSvgMarkup } from './mapImporter';
import { inferBoundaryAdjacency } from './svgAdjacency';
import { measureRegionGeometry } from './svgGeometry';
import { deriveTerrainDocument, TERRAIN_TYPES } from './terrainModel';

const SHAPE_SELECTOR = 'path,polygon,rect,circle,ellipse,polyline';
const EXCLUDED_ANCESTORS = 'defs,clipPath,mask,pattern,marker,symbol';
const TERRAIN_SET = new Set(TERRAIN_TYPES);
const LAKE_WORDS = /(^|[\s_-])(lake|pond|reservoir)([\s_-]|$)/i;
const OCEAN_WORDS = /(^|[\s_-])(water|sea|ocean)([\s_-]|$)/i;
const IGNORE_WORDS = /(^|[\s_-])(decor|decoration|background|frame|border|label|legend)([\s_-]|$)/i;

function parseNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseViewBox(svg) {
  const values = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
    return { x: values[0], y: values[1], width: values[2], height: values[3] };
  }
  return {
    x: 0,
    y: 0,
    width: Math.max(1, parseNumber(svg.getAttribute('width'), 1000)),
    height: Math.max(1, parseNumber(svg.getAttribute('height'), 1000)),
  };
}

function booleanAttribute(value) {
  if (value === null) return null;
  if (/^(true|1|yes)$/i.test(value)) return true;
  if (/^(false|0|no)$/i.test(value)) return false;
  return null;
}

function splitIds(value) {
  return value === null ? null : String(value).split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
}

function fillRgb(fill) {
  const value = String(fill || '').trim();
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  if (short) return short[1].split('').map((part) => parseInt(part + part, 16));
  const long = /^#([0-9a-f]{6})$/i.exec(value);
  if (long) return [0, 2, 4].map((index) => parseInt(long[1].slice(index, index + 2), 16));
  const rgb = /^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i.exec(value);
  return rgb ? rgb.slice(1, 4).map(Number) : null;
}

export function classifyAutomaticSurface(surface) {
  const semantic = `${surface.id || ''} ${surface.className || ''} ${surface.label || ''}`;
  if (surface.ignored || IGNORE_WORDS.test(semantic)) {
    return { terrainType: 'ignored', confidence: surface.ignored ? 0.99 : 0.74, evidence: ['semantic_ignore'] };
  }
  if (LAKE_WORDS.test(semantic)) return { terrainType: 'lake', confidence: 0.88, evidence: ['semantic_lake'] };
  if (OCEAN_WORDS.test(semantic)) return { terrainType: 'ocean', confidence: 0.82, evidence: ['semantic_ocean'] };
  const rgb = fillRgb(surface.fill);
  if (rgb) {
    const [red, green, blue] = rgb;
    if (blue > red * 1.18 && (blue + green) / 2 > red * 1.12) {
      const lightness = (Math.max(...rgb) + Math.min(...rgb)) / 510;
      return {
        terrainType: lightness > 0.48 || green > blue * 0.78 ? 'lake' : 'ocean',
        confidence: 0.56,
        evidence: ['fill_color'],
      };
    }
    if (Math.max(...rgb) - Math.min(...rgb) < 16) {
      return { terrainType: 'ignored', confidence: 0.38, evidence: ['neutral_fill'] };
    }
  }
  return {
    terrainType: 'land',
    confidence: surface.explicitRegion ? 0.96 : 0.58,
    evidence: [surface.explicitRegion ? 'explicit_region' : 'default_shape'],
  };
}

function pointInLine(point, line) {
  let inside = false;
  for (let first = 0, second = line.length - 1; first < line.length; second = first, first += 1) {
    const a = line[first];
    const b = line[second];
    const crosses = ((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInBoundary(point, boundary) {
  return (boundary || []).reduce((inside, line) => (
    line.length > 2 && pointInLine(point, line) ? !inside : inside
  ), false);
}

function stableCellHash(cells) {
  let hash = 2166136261;
  for (const cell of cells) {
    hash ^= cell + 1;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

function componentRuns(cells, columns) {
  const sorted = [...cells].sort((a, b) => a - b);
  const runs = [];
  let start = null;
  let previous = null;
  for (const cell of sorted) {
    const sameRow = previous !== null && Math.floor(previous / columns) === Math.floor(cell / columns);
    if (start === null || cell !== previous + 1 || !sameRow) {
      if (start !== null) runs.push([start, previous]);
      start = cell;
    }
    previous = cell;
  }
  if (start !== null) runs.push([start, previous]);
  return runs;
}

export function buildWaterComponents({ columns, rows, owners, viewBox }) {
  const visited = new Uint8Array(columns * rows);
  const components = [];
  const stepX = viewBox.width / columns;
  const stepY = viewBox.height / rows;
  for (let seed = 0; seed < owners.length; seed += 1) {
    if (owners[seed] !== null || visited[seed]) continue;
    const queue = [seed];
    const cells = [];
    let reachesBoundary = false;
    visited[seed] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const cell = queue[cursor];
      cells.push(cell);
      const column = cell % columns;
      const row = Math.floor(cell / columns);
      if (column === 0 || row === 0 || column === columns - 1 || row === rows - 1) reachesBoundary = true;
      const neighbors = [
        column > 0 ? cell - 1 : -1,
        column < columns - 1 ? cell + 1 : -1,
        row > 0 ? cell - columns : -1,
        row < rows - 1 ? cell + columns : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && owners[neighbor] === null && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    const xs = cells.map((cell) => cell % columns);
    const ys = cells.map((cell) => Math.floor(cell / columns));
    const id = `water_${stableCellHash(cells)}`;
    components.push({
      id,
      name: reachesBoundary ? 'Çıkarılan okyanus' : 'Çıkarılan göl',
      synthetic: true,
      touchesRootBoundary: reachesBoundary,
      automatic: { terrainType: reachesBoundary ? 'ocean' : 'lake', confidence: 0.78, evidence: ['negative_space'] },
      metadataTerrainType: null,
      hostOverride: null,
      adjacentSurfaceIds: [],
      bounds: {
        x: viewBox.x + Math.min(...xs) * stepX,
        y: viewBox.y + Math.min(...ys) * stepY,
        width: (Math.max(...xs) - Math.min(...xs) + 1) * stepX,
        height: (Math.max(...ys) - Math.min(...ys) + 1) * stepY,
      },
      area: cells.length * stepX * stepY,
      geometry: { type: 'grid_runs', columns, rows, runs: componentRuns(cells, columns) },
      gridCells: cells,
    });
  }
  return components.sort((a, b) => a.id.localeCompare(b.id));
}

function gridDimensions(viewBox) {
  const ratio = Math.max(0.1, Math.min(10, viewBox.width / viewBox.height));
  return {
    columns: Math.max(40, Math.min(192, Math.round(112 * Math.sqrt(ratio)))),
    rows: Math.max(40, Math.min(192, Math.round(112 / Math.sqrt(ratio)))),
  };
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Harita analizi iptal edildi.', 'AbortError');
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function isRenderable(element) {
  if (element.closest(EXCLUDED_ANCESTORS)) return false;
  const style = (element.getAttribute('style') || '').toLowerCase();
  const fill = (element.getAttribute('fill') || '').trim().toLowerCase();
  return element.getAttribute('display') !== 'none'
    && element.getAttribute('visibility') !== 'hidden'
    && element.getAttribute('opacity') !== '0'
    && !/(?:^|;)\s*display\s*:\s*none/.test(style)
    && !/(?:^|;)\s*visibility\s*:\s*hidden/.test(style)
    && fill !== 'none'
    && !/(?:^|;)\s*fill\s*:\s*none/.test(style);
}

export async function analyzeSvgTerrain({ svgText, signal, onProgress } = {}) {
  throwIfAborted(signal);
  onProgress?.({ phase: 'sanitize', progress: 0.05, message: 'SVG güvenli hale getiriliyor…' });
  const sanitizedSvg = sanitizeSvgMarkup(svgText);
  const document = new DOMParser().parseFromString(sanitizedSvg, 'image/svg+xml');
  const svg = document.documentElement;
  const viewBox = parseViewBox(svg);
  const elements = [...svg.querySelectorAll(SHAPE_SELECTOR)].filter(isRenderable);
  const usedIds = new Set();
  const sourceIds = new Set();
  const importIssues = [];
  const records = elements.map((element, index) => {
    const sourceId = element.getAttribute('id') || `surface_${index + 1}`;
    let id = normalizeRegionId(sourceId, `surface_${index + 1}`);
    if (sourceIds.has(sourceId)) importIssues.push({ severity: 'error', code: 'DUPLICATE_ID', message: `SVG içinde “${sourceId}” kimliği yineleniyor.` });
    sourceIds.add(sourceId);
    if (id !== sourceId) importIssues.push({ severity: 'warning', code: 'NORMALIZED_ID', message: `“${sourceId}” güvenli “${id}” kimliğine dönüştürüldü.` });
    let suffix = 2;
    if (usedIds.has(id)) importIssues.push({ severity: 'error', code: 'DUPLICATE_ID', message: `Birden fazla SVG kimliği “${id}” değerine dönüşüyor.` });
    while (usedIds.has(id)) id = `${normalizeRegionId(sourceId)}_${suffix++}`;
    usedIds.add(id);
    element.setAttribute('id', id);
    element.setAttribute('data-surface-id', id);
    element.setAttribute('data-region-id', id);
    const semantic = {
      id,
      className: element.getAttribute('class') || '',
      label: element.getAttribute('aria-label') || element.getAttribute('data-name') || '',
      fill: element.getAttribute('fill') || element.style?.fill || '',
      explicitRegion: element.getAttribute('data-region') === 'true',
      ignored: element.getAttribute('data-ignore') === 'true',
    };
    return { element, id, sourceId, automatic: classifyAutomaticSurface(semantic) };
  });
  const sourceToId = new Map(records.map((record) => [record.sourceId, record.id]));
  const resolveIds = (values) => values === null ? null : [...new Set(values.map((value) => sourceToId.get(value) || normalizeRegionId(value)))].sort();
  await yieldToBrowser();
  throwIfAborted(signal);
  onProgress?.({ phase: 'geometry', progress: 0.24, message: 'ViewBox geometrisi ölçülüyor…' });
  const geometry = measureRegionGeometry(svg, records, viewBox);
  const surfaces = records.map((record) => {
    const element = record.element;
    const explicitTerrain = element.getAttribute('data-terrain');
    const metadataTerrainType = TERRAIN_SET.has(explicitTerrain) ? explicitTerrain : null;
    if (explicitTerrain !== null && !metadataTerrainType) importIssues.push({ severity: 'error', code: 'INVALID_TERRAIN', message: `“${record.sourceId}” için data-terrain değeri geçersiz.` });
    if (element.hasAttribute('data-port-allowed') && booleanAttribute(element.getAttribute('data-port-allowed')) === null) importIssues.push({ severity: 'error', code: 'INVALID_PORT_ALLOWED', message: `“${record.sourceId}” için data-port-allowed true veya false olmalı.` });
    if (element.hasAttribute('data-price') && !Number.isFinite(Number(element.getAttribute('data-price')))) importIssues.push({ severity: 'error', code: 'INVALID_NUMBER', message: `“${record.sourceId}” için data-price geçerli bir sayı değil.` });
    if (element.hasAttribute('data-income') && !Number.isFinite(Number(element.getAttribute('data-income')))) importIssues.push({ severity: 'error', code: 'INVALID_NUMBER', message: `“${record.sourceId}” için data-income geçerli bir sayı değil.` });
    const commonNeighbors = element.getAttribute('data-neighbors');
    const claimNeighbors = element.getAttribute('data-claim-neighbors') ?? commonNeighbors;
    const landNeighbors = element.getAttribute('data-land-neighbors') ?? commonNeighbors;
    const bounds = geometry.boundsById.get(record.id) || null;
    const boundaryTolerance = Math.hypot(viewBox.width, viewBox.height) * 0.002;
    return {
      id: record.id,
      elementId: record.id,
      sourceElementId: record.sourceId,
      name: element.getAttribute('data-name') || element.getAttribute('aria-label') || record.sourceId.replace(/[_-]+/g, ' '),
      automatic: record.automatic,
      metadataTerrainType,
      hostOverride: null,
      portPreference: booleanAttribute(element.getAttribute('data-port-allowed')),
      bounds,
      boundary: geometry.boundariesById.get(record.id) || [],
      area: geometry.boundsById.has(record.id)
        ? geometry.boundsById.get(record.id).width * geometry.boundsById.get(record.id).height
        : null,
      touchesRootBoundary: Boolean(bounds && (
        bounds.x <= viewBox.x + boundaryTolerance
        || bounds.y <= viewBox.y + boundaryTolerance
        || bounds.x + bounds.width >= viewBox.x + viewBox.width - boundaryTolerance
        || bounds.y + bounds.height >= viewBox.y + viewBox.height - boundaryTolerance
      )),
      adjacentSurfaceIds: [],
      claimNeighborIds: resolveIds(splitIds(claimNeighbors)),
      landNeighborIds: resolveIds(splitIds(landNeighbors)),
      seaNeighborIds: resolveIds(splitIds(element.getAttribute('data-sea-neighbors'))) || [],
      price: element.hasAttribute('data-price') && Number.isFinite(Number(element.getAttribute('data-price')))
        ? Number(element.getAttribute('data-price')) : null,
      income: element.hasAttribute('data-income') && Number.isFinite(Number(element.getAttribute('data-income')))
        ? Number(element.getAttribute('data-income')) : null,
    };
  });
  const preliminary = deriveTerrainDocument({ viewBox, surfaces });
  const { columns, rows } = gridDimensions(viewBox);
  const owners = new Array(columns * rows).fill(null);
  const stepX = viewBox.width / columns;
  const stepY = viewBox.height / rows;
  onProgress?.({ phase: 'water', progress: 0.42, message: 'Negatif alan ve su bileşenleri çıkarılıyor…' });
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const point = { x: viewBox.x + (column + 0.5) * stepX, y: viewBox.y + (row + 0.5) * stepY };
      const containing = preliminary.surfaces.find((surface) => pointInBoundary(point, surface.boundary));
      if (containing?.terrainType === 'land') owners[row * columns + column] = containing.id;
      else if (containing && (containing.terrainType === 'ocean' || containing.terrainType === 'lake')) {
        owners[row * columns + column] = `@${containing.id}`;
      }
    }
    if (row > 0 && row % 24 === 0) {
      throwIfAborted(signal);
      onProgress?.({ phase: 'water', progress: 0.42 + (row / rows) * 0.28, message: 'Su bileşenleri taranıyor…' });
      await yieldToBrowser();
    }
  }
  const waterComponents = buildWaterComponents({ columns, rows, owners, viewBox });
  const allSurfaces = [...surfaces, ...waterComponents];
  const adjacency = inferBoundaryAdjacency(
    surfaces.map((surface) => surface.id),
    geometry.boundariesById,
    geometry.boundsById,
    viewBox,
  );
  const componentByCell = new Map();
  waterComponents.forEach((component) => component.gridCells.forEach((cell) => componentByCell.set(cell, component.id)));
  for (let cell = 0; cell < owners.length; cell += 1) {
    const componentId = componentByCell.get(cell);
    if (!componentId) continue;
    const column = cell % columns;
    const row = Math.floor(cell / columns);
    const neighborCells = [
      column > 0 ? cell - 1 : -1,
      column < columns - 1 ? cell + 1 : -1,
      row > 0 ? cell - columns : -1,
      row < rows - 1 ? cell + columns : -1,
    ];
    for (const neighborCell of neighborCells) {
      const owner = neighborCell >= 0 ? owners[neighborCell] : null;
      if (owner && !owner.startsWith('@')) {
        adjacency.get(owner)?.add(componentId);
        if (!adjacency.has(componentId)) adjacency.set(componentId, new Set());
        adjacency.get(componentId).add(owner);
      }
    }
  }
  for (const surface of allSurfaces) {
    const ids = new Set(adjacency.get(surface.id) || []);
    if (!surface.synthetic) {
      for (const neighbor of surfaces) {
        if (neighbor.id !== surface.id && adjacency.get(surface.id)?.has(neighbor.id)) ids.add(neighbor.id);
      }
    }
    surface.adjacentSurfaceIds = [...ids].sort();
    delete surface.gridCells;
  }
  throwIfAborted(signal);
  onProgress?.({ phase: 'derive', progress: 0.94, message: 'Kıyılar ve oynanabilir bölgeler türetiliyor…' });
  const result = deriveTerrainDocument({
    viewBox,
    surfaces: allSurfaces,
    compatibilityRoutes: surfaces.flatMap((surface) => surface.seaNeighborIds.map((neighborId) => [surface.id, neighborId])),
    analysisAlgorithmVersion: 'terrain-grid-v1',
    importIssues: [
      ...importIssues,
      ...(geometry.unmeasuredBoundaryIds.length ? [{
        severity: 'warning',
        code: 'ANALYSIS_GEOMETRY_INCOMPLETE',
        message: `${geometry.unmeasuredBoundaryIds.length} yüzeyin sınırı güvenilir biçimde ölçülemedi.`,
      }] : []),
    ],
  });
  onProgress?.({ phase: 'done', progress: 1, message: 'Arazi analizi tamamlandı.' });
  return { ...result, sanitizedSvg: new XMLSerializer().serializeToString(svg) };
}
