import { applyAutomaticPricing, PRICING_VERSION, summarizeRegionEconomy } from './pricing';
import {
  NAVAL_POLICIES,
  migrateLegacyNavalPolicy,
  navalRouteKey,
  normalizeRouteList,
} from './navalPolicy';

export const TERRAIN_TYPES = Object.freeze(['land', 'ocean', 'lake', 'ignored']);
export const CLASSIFICATION_SOURCES = Object.freeze(['automatic', 'metadata', 'host_override']);
export const EDITOR_SCHEMA_VERSION = 2;
export const METADATA_SCHEMA_VERSION = 2;
export const ANALYSIS_ALGORITHM_VERSION = 'terrain-grid-v2';

const TERRAIN_SET = new Set(TERRAIN_TYPES);

function terrain(value, fallback = 'ignored') {
  return TERRAIN_SET.has(value) ? value : fallback;
}

function uniqueSorted(values = []) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value))].sort();
}

function clampConfidence(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function effectiveClassification(surface) {
  if (TERRAIN_SET.has(surface.hostOverride)) {
    return { terrainType: surface.hostOverride, classificationSource: 'host_override' };
  }
  if (TERRAIN_SET.has(surface.metadataTerrainType)) {
    return { terrainType: surface.metadataTerrainType, classificationSource: 'metadata' };
  }
  return {
    terrainType: terrain(surface.automatic?.terrainType),
    classificationSource: 'automatic',
  };
}

export function normalizeSurface(surface, index = 0) {
  const id = String(surface?.id || `surface_${index + 1}`);
  const effective = effectiveClassification(surface || {});
  return {
    ...surface,
    id,
    name: String(surface?.name || id),
    automatic: {
      ...(surface?.automatic || {}),
      terrainType: terrain(surface?.automatic?.terrainType),
      confidence: clampConfidence(surface?.automatic?.confidence),
    },
    metadataTerrainType: TERRAIN_SET.has(surface?.metadataTerrainType) ? surface.metadataTerrainType : null,
    hostOverride: TERRAIN_SET.has(surface?.hostOverride) ? surface.hostOverride : null,
    adjacentSurfaceIds: uniqueSorted(surface?.adjacentSurfaceIds),
    terrainType: effective.terrainType,
    classificationSource: effective.classificationSource,
    confidence: clampConfidence(surface?.automatic?.confidence),
    coastType: 'none',
    portAllowed: false,
  };
}

export function summarizeTerrain(surfaces) {
  const counts = Object.fromEntries(TERRAIN_TYPES.map((type) => [type, 0]));
  let coastalLandCount = 0;
  let portAllowedCount = 0;
  for (const surface of surfaces) {
    counts[surface.terrainType] += 1;
    if (surface.terrainType === 'land' && surface.coastType !== 'none') coastalLandCount += 1;
    if (surface.portAllowed) portAllowedCount += 1;
  }
  return {
    playableLandCount: counts.land,
    oceanCount: counts.ocean,
    lakeCount: counts.lake,
    ignoredCount: counts.ignored,
    coastalLandCount,
    portAllowedCount,
  };
}

export function deriveTerrainDocument(document = {}) {
  const normalized = (document.surfaces || []).map(normalizeSurface);
  const provisionalById = Object.fromEntries(normalized.map((surface) => [surface.id, surface]));
  const surfaces = normalized.map((surface) => {
    if (surface.terrainType !== 'land') return surface;
    const waterTypes = new Set(surface.adjacentSurfaceIds
      .map((id) => provisionalById[id]?.terrainType)
      .filter((type) => type === 'ocean' || type === 'lake'));
    const coastType = waterTypes.size === 2
      ? 'both'
      : waterTypes.has('ocean')
        ? 'ocean'
        : waterTypes.has('lake')
          ? 'lake'
          : 'none';
    return {
      ...surface,
      coastType,
      portAllowed: coastType !== 'none' && surface.portPreference !== false,
    };
  });
  const surfacesById = Object.fromEntries(surfaces.map((surface) => [surface.id, surface]));
  const migrated = migrateLegacyNavalPolicy(document, { defaultPolicy: NAVAL_POLICIES.ALL_COASTS });
  const allowed = normalizeRouteList(migrated.allowedRoutes, { surfacesById, keepInvalid: true });
  const blocked = normalizeRouteList(migrated.blockedRoutes, { surfacesById, keepInvalid: true });
  const validCompatibilityRoutes = allowed.routes;
  const invalidatedCompatibilityRoutes = [...allowed.invalidRoutes, ...blocked.invalidRoutes]
    .filter((route, index, routes) => routes.findIndex((candidate) => navalRouteKey(candidate) === navalRouteKey(route)) === index)
    .sort((first, second) => navalRouteKey(first).localeCompare(navalRouteKey(second)));
  return {
    ...document,
    editorSchemaVersion: EDITOR_SCHEMA_VERSION,
    metadataSchemaVersion: METADATA_SCHEMA_VERSION,
    analysisAlgorithmVersion: document.analysisAlgorithmVersion || ANALYSIS_ALGORITHM_VERSION,
    surfaces,
    surfacesById,
    navalPolicy: migrated.navalPolicy,
    allowedRoutes: allowed.routes,
    blockedRoutes: blocked.routes,
    compatibilityRoutes: allowed.routes,
    validCompatibilityRoutes,
    invalidatedCompatibilityRoutes,
    summary: summarizeTerrain(surfaces),
  };
}

export function buildCompatibilityMapDefinition(document) {
  const derived = document?.surfacesById ? document : deriveTerrainDocument(document);
  const land = derived.surfaces.filter((surface) => surface.terrainType === 'land');
  const landIds = new Set(land.map((surface) => surface.id));
  const priced = applyAutomaticPricing(land.map((surface) => ({
    ...surface,
    area: Number.isFinite(surface.area)
      ? surface.area
      : Number.isFinite(surface.bounds?.width) && Number.isFinite(surface.bounds?.height)
        ? surface.bounds.width * surface.bounds.height
        : null,
    explicitPrice: Number.isFinite(surface.price) ? surface.price : null,
    explicitIncome: Number.isFinite(surface.income) ? surface.income : null,
  }))).records;
  const routeNeighbors = new Map(land.map((surface) => [surface.id, []]));
  for (const [first, second] of derived.navalPolicy === NAVAL_POLICIES.SELECTED_ROUTES
    ? (derived.allowedRoutes || []) : []) {
    routeNeighbors.get(first)?.push(second);
    routeNeighbors.get(second)?.push(first);
  }
  const regions = priced.map((surface) => {
    const adjacentLand = uniqueSorted(surface.adjacentSurfaceIds.filter((id) => landIds.has(id)));
    const explicitClaim = Array.isArray(surface.claimNeighborIds)
      ? uniqueSorted(surface.claimNeighborIds.filter((id) => landIds.has(id)))
      : adjacentLand;
    const explicitLand = Array.isArray(surface.landNeighborIds)
      ? uniqueSorted(surface.landNeighborIds.filter((id) => landIds.has(id)))
      : adjacentLand;
    return {
      id: surface.id,
      name: surface.name,
      price: surface.price,
      income: surface.income,
      bounds: surface.bounds || null,
      landNeighbors: explicitLand,
      claimNeighbors: explicitClaim,
      coastal: surface.coastType !== 'none',
      coastType: surface.coastType,
      portAllowed: surface.portAllowed === true,
      seaNeighbors: uniqueSorted(routeNeighbors.get(surface.id)),
    };
  });
  return {
    version: 1,
    pricingVersion: PRICING_VERSION,
    geometryVersion: 2,
    boundsSpace: 'viewBox',
    terrainSchemaVersion: METADATA_SCHEMA_VERSION,
    analysisAlgorithmVersion: derived.analysisAlgorithmVersion,
    navalPolicy: derived.navalPolicy,
    allowedRoutes: (derived.allowedRoutes || []).map(navalRouteKey),
    blockedRoutes: (derived.blockedRoutes || []).map(navalRouteKey),
    viewBox: derived.viewBox,
    regionIds: regions.map((region) => region.id),
    regions,
    regionsById: Object.fromEntries(regions.map((region) => [region.id, region])),
    pricingSummary: summarizeRegionEconomy(regions),
    importIssues: Array.isArray(derived.importIssues) ? derived.importIssues : [],
  };
}
