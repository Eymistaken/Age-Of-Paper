import { SAFE_REGION_ID } from './mapValidation';
import { sanitizeSvgMarkup } from './mapImporter';
import { extractSurfaceCandidates, parseSurfaceViewBox } from './surfaceCandidates';
import {
  ANALYSIS_ALGORITHM_VERSION,
  EDITOR_SCHEMA_VERSION,
  METADATA_SCHEMA_VERSION,
  TERRAIN_TYPES,
} from './terrainModel';
import { normalizeNavigationMask } from './waterNavigation';

const SVG_NS = 'http://www.w3.org/2000/svg';
const METADATA_ID = 'age-of-paper-map';
const MAX_METADATA_CHARACTERS = 450_000;
const TERRAIN_SET = new Set(TERRAIN_TYPES);
const COAST_TYPES = new Set(['none', 'ocean', 'lake', 'both']);
const SOURCE_TYPES = new Set(['automatic', 'metadata', 'host_override']);
const TOP_LEVEL_FIELDS = new Set([
  'schemaVersion', 'editorVersion', 'analysisAlgorithmVersion', 'mapId', 'revision', 'displayName',
  'sourceGeometryHash', 'baseSvgHash', 'compact', 'viewBox', 'compatibilityRoutes', 'surfaces',
  'importIssues', 'navalPolicy', 'allowedRoutes', 'blockedRoutes', 'navigationMask',
]);
const SURFACE_FIELDS = new Set([
  'id', 'elementId', 'name', 'terrainType', 'classificationSource', 'confidence',
  'metadataTerrainType', 'hostOverride', 'coastType', 'portAllowed', 'portPreference',
  'adjacentSurfaceIds', 'claimNeighborIds', 'landNeighborIds', 'price', 'income',
  'touchesRootBoundary', 'synthetic', 'automatic', 'bounds', 'boundary', 'geometry',
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function fallbackHash(text) {
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export async function hashText(value) {
  const text = String(value || '');
  if (globalThis.crypto?.subtle && typeof TextEncoder !== 'undefined') {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return fallbackHash(text);
}

function parseSvg(svgText) {
  const safe = sanitizeSvgMarkup(svgText);
  return new DOMParser().parseFromString(safe, 'image/svg+xml');
}

export function stripEditorMetadata(svgText) {
  const document = parseSvg(svgText);
  document.querySelectorAll(`#${METADATA_ID},[data-aop-editor-overlay="true"]`).forEach((element) => element.remove());
  const svg = document.documentElement;
  extractSurfaceCandidates(svg, { viewBox: parseSurfaceViewBox(svg) });
  document.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.startsWith('data-aop-')
        || [
          'data-terrain', 'data-port-allowed', 'data-coast-type', 'data-region', 'data-region-id',
          'data-surface-id', 'data-name', 'data-price', 'data-income', 'data-neighbors', 'data-claim-neighbors',
          'data-land-neighbors', 'data-sea-neighbors', 'data-coastal',
        ].includes(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }
    element.classList.remove('default-land');
    if (!element.getAttribute('class')) element.removeAttribute('class');
  });
  return new XMLSerializer().serializeToString(document.documentElement);
}

function surfaceMetadata(surface, compact) {
  const common = {
    id: surface.id,
    elementId: surface.elementId || null,
    name: surface.name,
    terrainType: surface.terrainType,
    classificationSource: surface.classificationSource,
    confidence: surface.confidence,
    metadataTerrainType: surface.metadataTerrainType || null,
    hostOverride: surface.hostOverride || null,
    coastType: surface.coastType,
    portAllowed: surface.portAllowed === true,
    portPreference: surface.portPreference ?? null,
    adjacentSurfaceIds: [...(surface.adjacentSurfaceIds || [])].sort(),
    claimNeighborIds: Array.isArray(surface.claimNeighborIds) ? [...surface.claimNeighborIds].sort() : null,
    landNeighborIds: Array.isArray(surface.landNeighborIds) ? [...surface.landNeighborIds].sort() : null,
    touchesRootBoundary: surface.touchesRootBoundary === true,
    synthetic: surface.synthetic === true,
    price: Number.isFinite(surface.price) ? surface.price : null,
    income: Number.isFinite(surface.income) ? surface.income : null,
  };
  if (compact) return common;
  return {
    ...common,
    automatic: surface.automatic,
    bounds: surface.bounds || null,
    boundary: surface.boundary || null,
    geometry: surface.geometry || null,
  };
}

export function createMetadataPackage(document, { compact = false } = {}) {
  return canonicalize({
    schemaVersion: METADATA_SCHEMA_VERSION,
    editorVersion: EDITOR_SCHEMA_VERSION,
    analysisAlgorithmVersion: document.analysisAlgorithmVersion || ANALYSIS_ALGORITHM_VERSION,
    mapId: String(document.mapId || ''),
    revision: Number.isSafeInteger(document.revision) && document.revision > 0 ? document.revision : 1,
    displayName: String(document.displayName || 'İsimsiz Harita').slice(0, 120),
    sourceGeometryHash: String(document.sourceGeometryHash || ''),
    baseSvgHash: String(document.baseSvgHash || ''),
    compact,
    viewBox: document.viewBox,
    compatibilityRoutes: document.validCompatibilityRoutes || document.compatibilityRoutes || [],
    navalPolicy: document.navalPolicy,
    allowedRoutes: document.allowedRoutes || [],
    blockedRoutes: document.blockedRoutes || [],
    navigationMask: document.navigationMask || null,
    importIssues: Array.isArray(document.importIssues) ? document.importIssues.slice(0, 1000) : [],
    surfaces: (document.surfaces || []).map((surface) => surfaceMetadata(surface, compact)),
  });
}

export function migrateMetadataPackage(metadata) {
  if (!metadata || typeof metadata !== 'object' || metadata.schemaVersion !== 1) return metadata;
  const legacyRoutes = Array.isArray(metadata.compatibilityRoutes) ? metadata.compatibilityRoutes : [];
  return canonicalize({
    ...metadata,
    schemaVersion: METADATA_SCHEMA_VERSION,
    editorVersion: EDITOR_SCHEMA_VERSION,
    navalPolicy: legacyRoutes.length ? 'selected_routes' : 'all_coasts',
    allowedRoutes: legacyRoutes,
    blockedRoutes: [],
    navigationMask: null,
  });
}

function issue(code, message, surfaceId) {
  return surfaceId ? { code, message, surfaceId } : { code, message };
}

export function validateMetadataPackage(metadata, { elementIds } = {}) {
  const errors = [];
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { valid: false, errors: [issue('INVALID_METADATA', 'Age of Paper metadata kaydı bir nesne olmalı.')] };
  }
  if (metadata.schemaVersion !== METADATA_SCHEMA_VERSION) errors.push(issue('UNSUPPORTED_METADATA_VERSION', 'Metadata şema sürümü desteklenmiyor.'));
  if (metadata.editorVersion !== EDITOR_SCHEMA_VERSION) errors.push(issue('UNSUPPORTED_EDITOR_VERSION', 'Editör sürümü desteklenmiyor.'));
  if (metadata.analysisAlgorithmVersion !== ANALYSIS_ALGORITHM_VERSION) errors.push(issue('UNSUPPORTED_ANALYSIS_VERSION', 'Analiz algoritması sürümü desteklenmiyor.'));
  if (typeof metadata.mapId !== 'string' || !metadata.mapId || metadata.mapId.length > 120) errors.push(issue('INVALID_MAP_ID', 'Geçerli bir mapId gerekli.'));
  if (!Number.isSafeInteger(metadata.revision) || metadata.revision < 1) errors.push(issue('INVALID_REVISION', 'Harita revision değeri pozitif tam sayı olmalı.'));
  if (typeof metadata.sourceGeometryHash !== 'string' || metadata.sourceGeometryHash.length > 128) errors.push(issue('INVALID_SOURCE_HASH', 'Kaynak geometri hash alanı geçersiz.'));
  if (!Array.isArray(metadata.surfaces) || metadata.surfaces.length > 10_000) errors.push(issue('INVALID_SURFACES', 'Metadata yüzey listesi geçersiz.'));
  if (!Array.isArray(metadata.importIssues) || metadata.importIssues.length > 1000) errors.push(issue('INVALID_IMPORT_ISSUES', 'Metadata importIssues listesi geçersiz.'));
  if (Object.keys(metadata).some((key) => !TOP_LEVEL_FIELDS.has(key))) errors.push(issue('UNKNOWN_METADATA_FIELD', 'Metadata bilinmeyen bir üst düzey alan içeriyor.'));
  if (typeof metadata.compact !== 'boolean') errors.push(issue('INVALID_COMPACT_FLAG', 'Metadata compact alanı true veya false olmalı.'));
  if (!['all_coasts', 'selected_routes', 'disabled'].includes(metadata.navalPolicy)) errors.push(issue('INVALID_NAVAL_POLICY', 'Deniz politikası desteklenmiyor.'));
  if (!Array.isArray(metadata.allowedRoutes) || !Array.isArray(metadata.blockedRoutes)) errors.push(issue('INVALID_NAVAL_ROUTES', 'Deniz rota listeleri geçersiz.'));
  if (metadata.navigationMask !== null && !normalizeNavigationMask(metadata.navigationMask)) errors.push(issue('INVALID_NAVIGATION_MASK', 'Görsel su navigasyon maskesi geçersiz.'));
  if (!metadata.viewBox || ![metadata.viewBox.x, metadata.viewBox.y, metadata.viewBox.width, metadata.viewBox.height].every(Number.isFinite)
    || metadata.viewBox.width <= 0 || metadata.viewBox.height <= 0) errors.push(issue('INVALID_VIEWBOX', 'Metadata viewBox alanı geçersiz.'));
  const ids = new Set();
  const surfaces = Array.isArray(metadata.surfaces) ? metadata.surfaces : [];
  for (const surface of surfaces) {
    if (!SAFE_REGION_ID.test(surface?.id || '') || ids.has(surface.id)) {
      errors.push(issue(ids.has(surface?.id) ? 'DUPLICATE_SURFACE_ID' : 'INVALID_SURFACE_ID', 'Yüzey kimliği geçersiz veya yineleniyor.', surface?.id));
      continue;
    }
    ids.add(surface.id);
    if (Object.keys(surface).some((key) => !SURFACE_FIELDS.has(key))) errors.push(issue('UNKNOWN_SURFACE_FIELD', 'Yüzey bilinmeyen bir alan içeriyor.', surface.id));
    if (!TERRAIN_SET.has(surface.terrainType)) errors.push(issue('INVALID_TERRAIN', 'Terrain türü desteklenmiyor.', surface.id));
    if (!SOURCE_TYPES.has(surface.classificationSource)) errors.push(issue('INVALID_CLASSIFICATION_SOURCE', 'Sınıflandırma kaynağı desteklenmiyor.', surface.id));
    if (!Number.isFinite(surface.confidence) || surface.confidence < 0 || surface.confidence > 1) errors.push(issue('INVALID_CONFIDENCE', 'Güven değeri 0 ile 1 arasında olmalı.', surface.id));
    if (surface.metadataTerrainType !== null && !TERRAIN_SET.has(surface.metadataTerrainType)) errors.push(issue('INVALID_METADATA_TERRAIN', 'Metadata terrain sonucu geçersiz.', surface.id));
    if (surface.hostOverride !== null && !TERRAIN_SET.has(surface.hostOverride)) errors.push(issue('INVALID_HOST_OVERRIDE', 'Kurucu override sonucu geçersiz.', surface.id));
    if (!COAST_TYPES.has(surface.coastType)) errors.push(issue('INVALID_COAST', 'Kıyı türü desteklenmiyor.', surface.id));
    if (typeof surface.portAllowed !== 'boolean') errors.push(issue('INVALID_PORT', 'portAllowed true veya false olmalı.', surface.id));
    if (surface.portAllowed && (surface.terrainType !== 'land' || surface.coastType === 'none')) {
      errors.push(issue('INVALID_PORT', 'Yalnızca etkili kıyı kara yüzeyi limana izin verebilir.', surface.id));
    }
    if (!Array.isArray(surface.adjacentSurfaceIds)) errors.push(issue('INVALID_ADJACENCY', 'Komşuluk listesi geçersiz.', surface.id));
    if (surface.claimNeighborIds !== null && !Array.isArray(surface.claimNeighborIds)) errors.push(issue('INVALID_CLAIM_ADJACENCY', 'Claim komşuluk listesi geçersiz.', surface.id));
    if (surface.landNeighborIds !== null && !Array.isArray(surface.landNeighborIds)) errors.push(issue('INVALID_LAND_ADJACENCY', 'Kara komşuluk listesi geçersiz.', surface.id));
    if (typeof surface.touchesRootBoundary !== 'boolean') errors.push(issue('INVALID_BOUNDARY_CONTACT', 'Root viewBox sınır teması true veya false olmalı.', surface.id));
    if (typeof surface.synthetic !== 'boolean') errors.push(issue('INVALID_SYNTHETIC_FLAG', 'Synthetic yüzey işareti true veya false olmalı.', surface.id));
    if (surface.elementId !== null && surface.elementId !== undefined) {
      if (!SAFE_REGION_ID.test(surface.elementId)) errors.push(issue('INVALID_ELEMENT_REFERENCE', 'SVG öğe kimliği güvenli değil.', surface.id));
      if (elementIds && !elementIds.has(surface.elementId)) errors.push(issue('MISSING_ELEMENT_REFERENCE', 'Metadata SVG içinde bulunmayan bir öğeye başvuruyor.', surface.id));
    }
  }
  const surfaceById = Object.fromEntries(surfaces.map((surface) => [surface.id, surface]));
  for (const [field, routes] of [['allowedRoutes', metadata.allowedRoutes], ['blockedRoutes', metadata.blockedRoutes]]) {
    const seenRoutes = new Set();
    for (const route of Array.isArray(routes) ? routes : []) {
      const validPair = Array.isArray(route) && route.length === 2 && typeof route[0] === 'string' && typeof route[1] === 'string'
        && route[0].localeCompare(route[1]) < 0;
      const key = validPair ? `${route[0]}::${route[1]}` : '';
      const endpointsValid = validPair && [route[0], route[1]].every((id) => (
        surfaceById[id]?.terrainType === 'land' && ['ocean', 'lake', 'both'].includes(surfaceById[id]?.coastType)
      ));
      if (!validPair || !endpointsValid || seenRoutes.has(key)) errors.push(issue('INVALID_NAVAL_ROUTE', `${field} normalize edilmiş, benzersiz kıyı çiftleri içermeli.`));
      seenRoutes.add(key);
    }
  }
  for (const surface of surfaces) {
    for (const adjacentId of Array.isArray(surface.adjacentSurfaceIds) ? surface.adjacentSurfaceIds : []) {
      if (!ids.has(adjacentId)) errors.push(issue('UNKNOWN_SURFACE_REFERENCE', `Bilinmeyen “${adjacentId}” yüzeyine başvuruluyor.`, surface.id));
      else if (!surfaces.find((candidate) => candidate.id === adjacentId)?.adjacentSurfaceIds?.includes(surface.id)) {
        errors.push(issue('ASYMMETRIC_SURFACE_REFERENCE', `“${surface.id}” ile “${adjacentId}” yüzey komşuluğu çift yönlü olmalı.`, surface.id));
      }
    }
    for (const field of ['claimNeighborIds', 'landNeighborIds']) {
      for (const neighborId of Array.isArray(surface[field]) ? surface[field] : []) {
        if (!ids.has(neighborId)) errors.push(issue('UNKNOWN_GAME_ADJACENCY', `Bilinmeyen “${neighborId}” oynanabilir komşuluğuna başvuruluyor.`, surface.id));
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function embedMapMetadata(svgText, metadata) {
  const validation = validateMetadataPackage(metadata);
  if (!validation.valid) throw new Error(validation.errors[0].message);
  const serialized = canonicalJson(metadata);
  if (serialized.length > MAX_METADATA_CHARACTERS) throw new Error('Metadata izin verilen boyutu aşıyor.');
  const document = parseSvg(svgText);
  document.getElementById(METADATA_ID)?.remove();
  const node = document.createElementNS(SVG_NS, 'metadata');
  node.setAttribute('id', METADATA_ID);
  node.setAttribute('data-aop-schema-version', String(METADATA_SCHEMA_VERSION));
  node.textContent = serialized;
  document.documentElement.insertBefore(node, document.documentElement.firstChild);
  return new XMLSerializer().serializeToString(document.documentElement);
}

export function extractMapMetadata(svgText) {
  try {
    const document = parseSvg(svgText);
    const node = document.getElementById(METADATA_ID);
    if (!node) return { found: false, valid: false, metadata: null, errors: [] };
    const text = node.textContent || '';
    if (!text || text.length > MAX_METADATA_CHARACTERS) {
      return { found: true, valid: false, metadata: null, errors: [issue('METADATA_SIZE', 'Metadata boş veya izin verilen boyutu aşıyor.')] };
    }
    const metadata = migrateMetadataPackage(JSON.parse(text));
    const elementIds = new Set([...document.querySelectorAll('[id]')]
      .map((element) => element.id)
      .filter((id) => id !== METADATA_ID));
    const validation = validateMetadataPackage(metadata, { elementIds });
    return { found: true, metadata, ...validation };
  } catch {
    return { found: true, valid: false, metadata: null, errors: [issue('METADATA_PARSE', 'Age of Paper metadata kaydı okunamadı.')] };
  }
}

export function applyCompactMetadataToSvg(baseSvg, metadata) {
  const document = parseSvg(baseSvg);
  const elementIds = new Set([...document.querySelectorAll('[id]')].map((element) => element.id));
  const validation = validateMetadataPackage(metadata, { elementIds });
  if (!validation.valid) throw new Error(validation.errors[0].message);
  for (const element of document.querySelectorAll('[data-region],[data-region-id],[data-terrain],[data-port-allowed],[data-coast-type]')) {
    element.removeAttribute('data-region');
    element.removeAttribute('data-region-id');
    element.removeAttribute('data-terrain');
    element.removeAttribute('data-port-allowed');
    element.removeAttribute('data-coast-type');
    element.classList.remove('default-land');
  }
  for (const surface of metadata.surfaces) {
    if (!surface.elementId) continue;
    const element = document.getElementById(surface.elementId);
    if (!element) throw new Error(`SVG öğesi bulunamadı: ${surface.elementId}`);
    element.setAttribute('data-terrain', surface.terrainType);
    element.setAttribute('data-coast-type', surface.coastType);
    element.setAttribute('data-port-allowed', String(surface.portAllowed));
    if (surface.terrainType === 'land') {
      element.setAttribute('data-region', 'true');
      element.setAttribute('data-region-id', surface.id);
      element.setAttribute('data-name', surface.name || surface.id);
      if (Number.isFinite(surface.price)) element.setAttribute('data-price', String(surface.price));
      if (Number.isFinite(surface.income)) element.setAttribute('data-income', String(surface.income));
      element.classList.add('default-land');
    }
  }
  return new XMLSerializer().serializeToString(document.documentElement);
}
