import { SAFE_REGION_ID, validateMapDefinition } from './mapValidation';
import { applyAutomaticPricing, PRICING_VERSION, summarizeRegionEconomy } from './pricing';
import { boundsArea, measureRegionGeometry } from './svgGeometry';
import { inferBoundaryAdjacency } from './svgAdjacency';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PLAYABLE_SELECTOR = 'path,polygon,rect,circle,ellipse,polyline';
const EXCLUDED_ANCESTORS = 'defs,clipPath,mask,pattern,marker,symbol';
const DANGEROUS_ELEMENTS = 'script,foreignObject,iframe,object,embed,animate,animateMotion,animateTransform,set';
const DECORATION_WORDS = /(^|[\s_-])(water|sea|ocean|lake|river|decor|decoration|background|frame|border)([\s_-]|$)/i;

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

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseBoolean(value) {
  return /^(true|1|yes)$/i.test(String(value || ''));
}

function parseViewBox(svg) {
  const parts = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  }
  const width = parseNumber(svg.getAttribute('width')) || 1000;
  const height = parseNumber(svg.getAttribute('height')) || 1000;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  return { x: 0, y: 0, width, height };
}

function isExplicitDecoration(element) {
  if (element.closest(EXCLUDED_ANCESTORS)) return true;
  if (element.getAttribute('data-ignore') === 'true') return true;
  const semanticText = `${element.getAttribute('class') || ''} ${element.getAttribute('id') || ''}`;
  if (DECORATION_WORDS.test(semanticText)) return true;
  const fill = (element.getAttribute('fill') || '').trim().toLowerCase();
  const style = (element.getAttribute('style') || '').toLowerCase();
  return fill === 'none' || /(?:^|;)\s*fill\s*:\s*none(?:;|$)/.test(style);
}

function sanitizeDocument(document) {
  document.querySelectorAll(DANGEROUS_ELEMENTS).forEach((element) => element.remove());
  document.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
      } else if (name === 'href' || name === 'xlink:href') {
        if (!value.startsWith('#')) element.removeAttribute(attribute.name);
      } else if (name === 'src' || /javascript:|data:text\/html/i.test(value)) {
        element.removeAttribute(attribute.name);
      } else if (/url\(\s*['"]?(?:https?:|\/\/|data:)/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  document.querySelectorAll('style').forEach((style) => {
    if (/@import|url\(\s*['"]?(?:https?:|\/\/|data:)/i.test(style.textContent || '')) style.remove();
  });
}

function parseSvgDocument(svgText) {
  if (typeof DOMParser === 'undefined') {
    throw new Error('SVG işleme için DOMParser bulunamadı.');
  }
  const parser = new DOMParser();
  const document = parser.parseFromString(String(svgText || ''), 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement?.tagName.toLowerCase() !== 'svg') {
    throw new Error('Dosya geçerli bir SVG değil.');
  }
  sanitizeDocument(document);
  document.documentElement.setAttribute('xmlns', SVG_NS);
  return document;
}

export function sanitizeSvgMarkup(svgText) {
  const document = parseSvgDocument(svgText);
  return new XMLSerializer().serializeToString(document.documentElement);
}

function splitNeighborIds(value) {
  return String(value || '').split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

export function importSvgMap(svgText) {
  const document = parseSvgDocument(svgText);
  const svg = document.documentElement;
  const viewBox = parseViewBox(svg);
  const candidates = [...svg.querySelectorAll(PLAYABLE_SELECTOR)].filter((element) => !isExplicitDecoration(element));
  const explicit = candidates.filter((element) => element.getAttribute('data-region') === 'true');
  const playable = explicit.length ? explicit : candidates;
  const importIssues = [];
  const sourceIds = new Set();
  const safeIds = new Set();
  const sourceToSafe = new Map();
  const records = [];

  playable.forEach((element, index) => {
    const sourceId = element.getAttribute('id') || `region_${index + 1}`;
    let id = normalizeRegionId(sourceId, `region_${index + 1}`);
    if (sourceIds.has(sourceId)) {
      importIssues.push({ severity: 'error', code: 'DUPLICATE_ID', message: `SVG içinde “${sourceId}” kimliği yineleniyor.` });
    }
    sourceIds.add(sourceId);
    if (!SAFE_REGION_ID.test(sourceId)) {
      importIssues.push({ severity: 'warning', code: 'NORMALIZED_ID', message: `“${sourceId}” güvenli “${id}” kimliğine dönüştürüldü.` });
    }
    if (safeIds.has(id)) {
      importIssues.push({ severity: 'error', code: 'DUPLICATE_ID', message: `Birden fazla SVG kimliği “${id}” değerine dönüşüyor.` });
      let suffix = 2;
      while (safeIds.has(`${id}_${suffix}`)) suffix += 1;
      id = `${id}_${suffix}`;
    }
    safeIds.add(id);
    if (!sourceToSafe.has(sourceId)) sourceToSafe.set(sourceId, id);

    const name = element.getAttribute('data-name') || element.getAttribute('name') || sourceId.replace(/[_-]+/g, ' ');
    const priceAttribute = element.getAttribute('data-price');
    const incomeAttribute = element.getAttribute('data-income');
    const explicitPrice = parseNumber(priceAttribute);
    const explicitIncome = parseNumber(incomeAttribute);
    if (priceAttribute !== null && explicitPrice === null) {
      importIssues.push({ severity: 'error', code: 'INVALID_NUMBER', message: `“${name}” için data-price geçerli bir sayı değil.` });
    }
    if (incomeAttribute !== null && explicitIncome === null) {
      importIssues.push({ severity: 'error', code: 'INVALID_NUMBER', message: `“${name}” için data-income geçerli bir sayı değil.` });
    }
    const commonNeighbors = element.getAttribute('data-neighbors');
    const claimValue = element.getAttribute('data-claim-neighbors') ?? commonNeighbors;
    const landValue = element.getAttribute('data-land-neighbors') ?? commonNeighbors;
    const seaValue = element.getAttribute('data-sea-neighbors');

    element.setAttribute('id', id);
    element.setAttribute('data-region-id', id);
    element.setAttribute('data-region', 'true');
    element.setAttribute('data-name', name);
    element.classList.add('default-land');

    records.push({
      element,
      sourceId,
      id,
      name,
      explicitPrice,
      explicitIncome,
      coastal: parseBoolean(element.getAttribute('data-coastal')) || /coast|coastal/i.test(element.getAttribute('class') || ''),
      claimTokens: claimValue === null ? null : splitNeighborIds(claimValue),
      landTokens: landValue === null ? null : splitNeighborIds(landValue),
      seaTokens: seaValue === null ? [] : splitNeighborIds(seaValue),
    });
  });

  const geometry = measureRegionGeometry(svg, records, viewBox);
  const priced = applyAutomaticPricing(records.map((record) => {
    const bounds = geometry.boundsById.get(record.id) || null;
    return { ...record, bounds, area: boundsArea(bounds) };
  }));
  const pricedRecords = priced.records;
  if (geometry.unmeasuredIds.length) {
    const names = records
      .filter((record) => geometry.unmeasuredIds.includes(record.id))
      .map((record) => record.name)
      .slice(0, 5)
      .join(', ');
    importIssues.push({
      severity: 'warning',
      code: 'GEOMETRY_FALLBACK',
      message: `${geometry.unmeasuredIds.length} bölgenin görsel ölçümü alınamadı (${names}). Fiyat için güvenli medyan fallback kullanıldı.`,
    });
  }

  const usedLegacyInference = records.some((record) => record.claimTokens === null || record.landTokens === null);
  if (usedLegacyInference && records.length) {
    importIssues.push({
      severity: 'warning',
      code: 'LEGACY_NEIGHBORS',
      message: 'Komşuluk metadata’sı eksik. Bağlantılar SVG viewBox koordinatlarındaki gerçek ortak sınır temasından yaklaşık çıkarıldı; yayınlamadan önce kontrol edin.',
    });
  }

  const boundaryNeededIds = records
    .filter((record) => (record.claimTokens === null || record.landTokens === null)
      && geometry.unmeasuredBoundaryIds.includes(record.id))
    .map((record) => record.id);
  if (boundaryNeededIds.length) {
    importIssues.push({
      severity: 'warning',
      code: 'ADJACENCY_UNCERTAIN',
      message: `${boundaryNeededIds.length} bölgenin sınırı ölçülemedi. Yanlış pozitif üretmemek için bu bölgelerde otomatik komşuluk kurulmadı; metadata ekleyin.`,
    });
  }

  const resolveTokens = (tokens) => unique(tokens.map((token) => sourceToSafe.get(token) || normalizeRegionId(token)));
  const automaticGraph = inferBoundaryAdjacency(
    pricedRecords.map((record) => record.id),
    geometry.boundariesById,
    geometry.boundsById,
    viewBox,
  );
  const buildGraph = (tokenField) => {
    const graph = new Map(pricedRecords.map((record) => [record.id, new Set()]));
    const explicitById = new Map(pricedRecords.map((record) => [
      record.id,
      record[tokenField] === null ? null : new Set(resolveTokens(record[tokenField])),
    ]));
    for (const record of pricedRecords) {
      for (const neighborId of explicitById.get(record.id) || []) {
        if (!safeIds.has(neighborId)) graph.get(record.id).add(neighborId);
      }
    }
    for (let first = 0; first < pricedRecords.length; first += 1) {
      for (let second = first + 1; second < pricedRecords.length; second += 1) {
        const firstId = pricedRecords[first].id;
        const secondId = pricedRecords[second].id;
        const firstExplicit = explicitById.get(firstId);
        const secondExplicit = explicitById.get(secondId);
        const connected = firstExplicit !== null || secondExplicit !== null
          ? Boolean(firstExplicit?.has(secondId) || secondExplicit?.has(firstId))
          : automaticGraph.get(firstId)?.has(secondId);
        if (connected) {
          graph.get(firstId).add(secondId);
          graph.get(secondId).add(firstId);
        }
      }
    }
    return graph;
  };
  const claimGraph = buildGraph('claimTokens');
  const landGraph = buildGraph('landTokens');
  const regions = pricedRecords.map((record) => {
    return {
      id: record.id,
      name: record.name,
      price: record.price,
      income: record.income,
      bounds: record.bounds,
      landNeighbors: [...landGraph.get(record.id)],
      claimNeighbors: [...claimGraph.get(record.id)],
      coastal: record.coastal,
      seaNeighbors: resolveTokens(record.seaTokens),
    };
  });

  const mapDefinition = {
    version: 1,
    pricingVersion: PRICING_VERSION,
    geometryVersion: 2,
    boundsSpace: 'viewBox',
    importedAt: Date.now(),
    importer: usedLegacyInference ? 'legacy-svg-v3' : 'metadata-svg-v2',
    viewBox,
    regionIds: regions.map((region) => region.id),
    regions,
    regionsById: Object.fromEntries(regions.map((region) => [region.id, region])),
    pricingSummary: summarizeRegionEconomy(regions),
    importIssues,
  };
  const validation = validateMapDefinition(mapDefinition);
  const sanitizedSvg = new XMLSerializer().serializeToString(svg);
  return { sanitizedSvg, mapDefinition, validation };
}

export class MapMetadataConflictError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'MapMetadataConflictError';
    this.code = code;
    this.details = details;
  }
}

function newMapId() {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `map_${normalizeRegionId(random, 'local')}`;
}

export function validatePreparedMapRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('Yerel harita kaydı geçersiz.');
  if (typeof record.mapId !== 'string' || !record.mapId) throw new Error('Yerel harita kimliği geçersiz.');
  if (!record.terrainDocument || record.terrainDocument.mapId !== record.mapId) {
    throw new Error('Yerel harita kimliği terrain belgesiyle eşleşmiyor.');
  }
  if (!Array.isArray(record.terrainDocument.surfaces) || !record.terrainDocument.surfaces.length) {
    throw new Error('Yerel harita terrain yüzeyleri eksik.');
  }
  if (record.compactMetadata?.mapId && record.compactMetadata.mapId !== record.mapId) {
    throw new Error('Yerel harita kimliği metadata ile eşleşmiyor.');
  }
  if (record.fullMetadata?.mapId && record.fullMetadata.mapId !== record.mapId) {
    throw new Error('Yerel harita kimliği tam metadata ile eşleşmiyor.');
  }
  const validation = validateMapDefinition(record.mapDefinition);
  if (!validation.valid) throw new Error(validation.errors[0]?.message || 'Yerel harita oyun tanımı geçersiz.');
  if (typeof record.baseSvg !== 'string' || !record.baseSvg.trim()) throw new Error('Yerel haritanın temel SVG kaydı eksik.');
  return record;
}

/**
 * Builds the full local editor record. This API is async because hashing and
 * negative-space analysis intentionally yield between expensive phases.
 */
export async function prepareSvgMap(svgText, options = {}) {
  const {
    applyCompactMetadataToSvg,
    canonicalJson,
    createMetadataPackage,
    embedMapMetadata,
    extractMapMetadata,
    hashText,
    stripEditorMetadata,
  } = await import('./mapMetadata');
  const { analyzeSvgTerrain } = await import('./terrainAnalysis');
  const { buildCompatibilityMapDefinition, deriveTerrainDocument } = await import('./terrainModel');

  const originalSvg = String(svgText || '');
  const sanitizedOriginal = sanitizeSvgMarkup(originalSvg);
  const extracted = extractMapMetadata(sanitizedOriginal);
  if (extracted.found && !extracted.valid) {
    throw new MapMetadataConflictError(
      extracted.errors[0]?.message || 'Age of Paper metadata kaydı geçersiz.',
      'INVALID_EDITOR_METADATA',
      { errors: extracted.errors },
    );
  }
  const baseSvg = stripEditorMetadata(sanitizedOriginal);
  const baseSvgHash = await hashText(baseSvg);
  let terrainDocument;
  let metadataStatus = extracted.found ? 'invalid' : 'absent';

  if (extracted.found && extracted.valid) {
    if (extracted.metadata.sourceGeometryHash !== baseSvgHash) {
      if (options.metadataMismatch === 'reanalyze') {
        metadataStatus = 'geometry_mismatch_reanalyzed';
      } else {
        throw new MapMetadataConflictError(
          'Age of Paper metadata kaydı SVG geometrisiyle eşleşmiyor.',
          'SOURCE_GEOMETRY_MISMATCH',
          { expected: extracted.metadata.sourceGeometryHash, actual: baseSvgHash, metadata: extracted.metadata },
        );
      }
    } else {
      if (extracted.metadata.compact) {
        const regenerated = await analyzeSvgTerrain({
          svgText: baseSvg,
          signal: options.signal,
          onProgress: options.onProgress,
        });
        const importedById = Object.fromEntries(extracted.metadata.surfaces.map((surface) => [surface.id, surface]));
        terrainDocument = deriveTerrainDocument({
          ...regenerated,
          mapId: extracted.metadata.mapId,
          displayName: extracted.metadata.displayName,
          revision: extracted.metadata.revision,
          sourceGeometryHash: baseSvgHash,
          baseSvgHash,
          analysisAlgorithmVersion: extracted.metadata.analysisAlgorithmVersion,
          compatibilityRoutes: extracted.metadata.compatibilityRoutes,
          importIssues: extracted.metadata.importIssues,
          surfaces: regenerated.surfaces.map((surface) => importedById[surface.id]
            ? {
              ...surface,
              name: importedById[surface.id].name,
              metadataTerrainType: importedById[surface.id].metadataTerrainType,
              hostOverride: importedById[surface.id].hostOverride,
              portPreference: importedById[surface.id].portPreference,
              claimNeighborIds: importedById[surface.id].claimNeighborIds,
              landNeighborIds: importedById[surface.id].landNeighborIds,
              price: importedById[surface.id].price,
              income: importedById[surface.id].income,
            }
            : surface),
        });
      } else {
        terrainDocument = deriveTerrainDocument({
          mapId: extracted.metadata.mapId,
          displayName: extracted.metadata.displayName,
          revision: extracted.metadata.revision,
          sourceGeometryHash: baseSvgHash,
          baseSvgHash,
          viewBox: extracted.metadata.viewBox,
          analysisAlgorithmVersion: extracted.metadata.analysisAlgorithmVersion,
          compatibilityRoutes: extracted.metadata.compatibilityRoutes,
          importIssues: extracted.metadata.importIssues,
          surfaces: extracted.metadata.surfaces.map((surface) => ({
            ...surface,
            automatic: surface.automatic || {
              terrainType: surface.terrainType,
              confidence: surface.confidence,
              evidence: ['compact_metadata'],
            },
          })),
        });
      }
      metadataStatus = 'validated';
    }
  }

  if (!terrainDocument) {
    terrainDocument = await analyzeSvgTerrain({
      svgText: sanitizedOriginal,
      signal: options.signal,
      onProgress: options.onProgress,
    });
    terrainDocument = deriveTerrainDocument({
      ...terrainDocument,
      mapId: options.mapId || newMapId(),
      displayName: String(options.displayName || 'İsimsiz Harita').trim().slice(0, 120) || 'İsimsiz Harita',
      revision: 1,
      sourceGeometryHash: baseSvgHash,
      baseSvgHash,
    });
  }

  let mapDefinition = buildCompatibilityMapDefinition(terrainDocument);
  const pricedById = mapDefinition.regionsById;
  terrainDocument = deriveTerrainDocument({
    ...terrainDocument,
    baseSvgHash,
    sourceGeometryHash: baseSvgHash,
    surfaces: terrainDocument.surfaces.map((surface) => pricedById[surface.id]
      ? { ...surface, price: pricedById[surface.id].price, income: pricedById[surface.id].income }
      : surface),
  });
  mapDefinition = buildCompatibilityMapDefinition(terrainDocument);
  const validation = validateMapDefinition(mapDefinition);
  const fullMetadata = createMetadataPackage(terrainDocument);
  const compactMetadata = createMetadataPackage(terrainDocument, { compact: true });
  const metadataHash = await hashText(canonicalJson(compactMetadata));
  const composedSvg = applyCompactMetadataToSvg(baseSvg, compactMetadata);
  const preparedSvg = embedMapMetadata(composedSvg, compactMetadata);
  return {
    mapId: terrainDocument.mapId,
    displayName: terrainDocument.displayName,
    revision: terrainDocument.revision,
    originalSvg,
    baseSvg,
    preparedSvg,
    thumbnail: composedSvg,
    sanitizedSvg: composedSvg,
    mapDefinition,
    validation,
    terrainDocument,
    fullMetadata,
    compactMetadata,
    baseSvgHash,
    metadataHash,
    metadataStatus,
    createdAt: options.createdAt || Date.now(),
    updatedAt: Date.now(),
    sourceLabel: options.sourceLabel || 'Dosya içe aktarımı',
  };
}

export async function rebuildPreparedMap(preparedMap, nextTerrainDocument, options = {}) {
  const {
    applyCompactMetadataToSvg,
    canonicalJson,
    createMetadataPackage,
    embedMapMetadata,
    hashText,
  } = await import('./mapMetadata');
  const { buildCompatibilityMapDefinition, deriveTerrainDocument } = await import('./terrainModel');
  let terrainDocument = deriveTerrainDocument({
    ...nextTerrainDocument,
    mapId: preparedMap.mapId,
    displayName: options.displayName ?? nextTerrainDocument.displayName ?? preparedMap.displayName,
    revision: options.bumpRevision ? Math.max(preparedMap.revision || 1, nextTerrainDocument.revision || 1) + 1 : (nextTerrainDocument.revision || preparedMap.revision || 1),
    baseSvgHash: preparedMap.baseSvgHash,
    sourceGeometryHash: preparedMap.baseSvgHash,
  });
  let mapDefinition = buildCompatibilityMapDefinition(terrainDocument);
  terrainDocument = deriveTerrainDocument({
    ...terrainDocument,
    surfaces: terrainDocument.surfaces.map((surface) => mapDefinition.regionsById[surface.id]
      ? {
        ...surface,
        price: mapDefinition.regionsById[surface.id].price,
        income: mapDefinition.regionsById[surface.id].income,
      }
      : surface),
  });
  mapDefinition = buildCompatibilityMapDefinition(terrainDocument);
  const validation = validateMapDefinition(mapDefinition);
  const fullMetadata = createMetadataPackage(terrainDocument);
  const compactMetadata = createMetadataPackage(terrainDocument, { compact: true });
  const metadataHash = await hashText(canonicalJson(compactMetadata));
  const sanitizedSvg = applyCompactMetadataToSvg(preparedMap.baseSvg, compactMetadata);
  return {
    ...preparedMap,
    displayName: terrainDocument.displayName,
    revision: terrainDocument.revision,
    updatedAt: Date.now(),
    terrainDocument,
    mapDefinition,
    validation,
    fullMetadata,
    compactMetadata,
    metadataHash,
    sanitizedSvg,
    preparedSvg: embedMapMetadata(sanitizedSvg, compactMetadata),
    thumbnail: sanitizedSvg,
  };
}
