import { deriveTerrainDocument } from './terrainModel';

function flood(seeds, allowed, byId) {
  const seen = new Set(seeds.filter((id) => allowed.has(id)));
  const queue = [...seen];
  for (let index = 0; index < queue.length; index += 1) {
    for (const neighbor of byId[queue[index]]?.adjacentSurfaceIds || []) {
      if (allowed.has(neighbor) && !seen.has(neighbor)) {
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return seen;
}

function componentCount(ids, byId) {
  const remaining = new Set(ids);
  let count = 0;
  while (remaining.size) {
    const component = flood([[...remaining][0]], remaining, byId);
    component.forEach((id) => remaining.delete(id));
    count += 1;
  }
  return count;
}

export function analyzeSelectedBoundary(document, selectedIds) {
  const byId = document.surfacesById || Object.fromEntries((document.surfaces || []).map((surface) => [surface.id, surface]));
  const boundary = new Set(selectedIds.filter((id) => byId[id]));
  const all = new Set(Object.keys(byId));
  const remaining = new Set([...all].filter((id) => !boundary.has(id)));
  const invalid = (reasonCode, reason, outsideIds = [...remaining]) => ({
    valid: false,
    reasonCode,
    reason,
    boundaryIds: [...boundary],
    interiorIds: [],
    outsideIds,
  });
  if (!boundary.size) return invalid('EMPTY_BOUNDARY', 'Analiz için bitişik yüzeylerden oluşan kapalı bir sınır halkası seç.');
  if (!remaining.size) return invalid('NO_OUTSIDE', 'Her yüzey seçildiği için sınırın dışında kalacak bir dış alan kalmadı.', []);

  const connectedSize = flood([[...boundary][0]], boundary, byId).size;
  if (connectedSize !== boundary.size) {
    const components = componentCount(boundary, byId);
    return invalid('DISCONNECTED_BOUNDARY', `Seçim ${components} bağlantısız bileşen içeriyor; sınır halkası tek ve bağlı olmalı.`);
  }
  const endpoints = [...boundary].filter((id) => (
    (byId[id].adjacentSurfaceIds || []).filter((neighbor) => boundary.has(neighbor)).length < 2
  ));
  if (endpoints.length) {
    return invalid('BOUNDARY_ENDPOINTS', `Bir kapalı sınır halkası için her seçili yüzeyin en az 2 seçili komşusu olmalı; ${endpoints.length} yüzey bu koşulu sağlamıyor.`);
  }
  const outsideSeeds = [...remaining].filter((id) => (
    byId[id].touchesRootBoundary === true
    || byId[id].terrainType === 'ocean'
    || byId[id].automatic?.terrainType === 'ocean'
  ));
  if (!outsideSeeds.length) {
    return invalid('NO_OUTSIDE_COMPONENT', 'Seçim dışında yüzeyler var ancak root sınırına veya okyanusa bağlı güvenilir bir dış alan bulunamadı.');
  }
  const outside = flood(outsideSeeds, remaining, byId);
  if (!outside.size) return invalid('NO_OUTSIDE_COMPONENT', 'Sınır halkasının dışında güvenilir bir alan tespit edilemedi.');
  const interior = new Set([...remaining].filter((id) => !outside.has(id)));
  if (!interior.size) {
    return invalid('NO_INTERIOR', 'Seçim bağlı görünüyor ancak halkayla çevrelenmiş algılanabilir bir iç alan yok; dolu alanı değil yalnız sınır halkasını seç.');
  }
  return {
    valid: true,
    reasonCode: null,
    boundaryIds: [...boundary],
    interiorIds: [...interior],
    outsideIds: [...outside],
    reason: '',
  };
}

export function previewBatchTerrainChange(document, groups) {
  const overrides = new Map();
  for (const group of groups) {
    if (!group.terrainType) continue;
    for (const id of group.ids || []) overrides.set(id, group.terrainType);
  }
  const next = deriveTerrainDocument({
    ...document,
    surfaces: document.surfaces.map((surface) => overrides.has(surface.id)
      ? { ...surface, hostOverride: overrides.get(surface.id) }
      : surface),
  });
  return {
    document: next,
    changedSurfaceCount: [...overrides].filter(([id, type]) => document.surfacesById[id]?.terrainType !== type).length,
    playableDelta: next.summary.playableLandCount - document.summary.playableLandCount,
    disabledPortIds: document.surfaces.filter((surface) => surface.portAllowed && !next.surfacesById[surface.id]?.portAllowed).map((surface) => surface.id),
    changedCoastIds: document.surfaces.filter((surface) => surface.coastType !== next.surfacesById[surface.id]?.coastType).map((surface) => surface.id),
    changedAdjacencyCount: document.surfaces.reduce((count, surface) => {
      if (surface.terrainType !== 'land') return count;
      const before = surface.adjacentSurfaceIds.filter((id) => document.surfacesById[id]?.terrainType === 'land').sort().join('|');
      const after = (next.surfacesById[surface.id]?.adjacentSurfaceIds || []).filter((id) => next.surfacesById[id]?.terrainType === 'land').sort().join('|');
      return count + (before === after ? 0 : 1);
    }, 0),
    invalidatedCompatibilityRoutes: next.invalidatedCompatibilityRoutes,
  };
}
