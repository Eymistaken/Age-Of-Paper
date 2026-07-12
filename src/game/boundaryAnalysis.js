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

export function analyzeSelectedBoundary(document, selectedIds) {
  const byId = document.surfacesById || Object.fromEntries((document.surfaces || []).map((surface) => [surface.id, surface]));
  const boundary = new Set(selectedIds.filter((id) => byId[id]));
  const all = new Set(Object.keys(byId));
  const remaining = new Set([...all].filter((id) => !boundary.has(id)));
  const connectedBoundary = boundary.size > 0 && flood([[...boundary][0]], boundary, byId).size === boundary.size;
  const cycleLike = [...boundary].every((id) => (
    (byId[id].adjacentSurfaceIds || []).filter((neighbor) => boundary.has(neighbor)).length >= 2
  ));
  const outsideSeeds = [...remaining].filter((id) => (
    byId[id].touchesRootBoundary === true
    || byId[id].terrainType === 'ocean'
    || byId[id].automatic?.terrainType === 'ocean'
  ));
  const outside = flood(outsideSeeds, remaining, byId);
  const interior = new Set([...remaining].filter((id) => !outside.has(id)));
  const valid = connectedBoundary && cycleLike && outside.size > 0 && interior.size > 0;
  return {
    valid,
    boundaryIds: [...boundary],
    interiorIds: valid ? [...interior] : [],
    outsideIds: valid ? [...outside] : [...remaining],
    reason: valid ? '' : !connectedBoundary || !cycleLike
      ? 'Seçilen yüzeyler kapalı ve kesintisiz bir sınır oluşturmuyor.'
      : 'Sınırın içi ve dışı güvenilir biçimde ayrılamadı.',
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
