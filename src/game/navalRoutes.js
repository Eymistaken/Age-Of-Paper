function byId(mapDefinition) {
  return mapDefinition?.regionsById || Object.fromEntries(
    (mapDefinition?.regions || []).map((region) => [region.id, region]),
  );
}

function uniqueSorted(values = []) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value))].sort();
}

export function normalizeNavalRegions(mapDefinition) {
  const regions = (mapDefinition?.regionIds || []).map((id) => {
    const region = byId(mapDefinition)[id] || { id };
    return {
      ...region,
      coastal: region.coastal === true,
      seaNeighbors: uniqueSorted(region.seaNeighbors),
    };
  });
  return {
    ...mapDefinition,
    regions,
    regionsById: Object.fromEntries(regions.map((region) => [region.id, region])),
  };
}

export function listNavalRoutes(mapDefinition) {
  const regions = byId(mapDefinition);
  const routes = [];
  for (const id of mapDefinition?.regionIds || []) {
    for (const neighborId of regions[id]?.seaNeighbors || []) {
      if (id.localeCompare(neighborId) < 0 && regions[neighborId]?.seaNeighbors?.includes(id)) {
        routes.push([id, neighborId]);
      }
    }
  }
  return routes;
}

export function setRegionCoastal(mapDefinition, regionId, coastal, { removeRoutes = false } = {}) {
  const normalized = normalizeNavalRegions(mapDefinition);
  const current = normalized.regionsById[regionId];
  if (!current) return { ok: false, code: 'UNKNOWN_REGION', reason: 'Bölge haritada bulunmuyor.' };
  if (!coastal && current.seaNeighbors.length && !removeRoutes) {
    return { ok: false, code: 'REGION_HAS_ROUTES', reason: 'Kıyı işaretini kaldırmadan önce deniz rotalarını kaldır.' };
  }
  const affected = new Set([regionId, ...current.seaNeighbors]);
  const regions = normalized.regions.map((region) => {
    if (region.id === regionId) return { ...region, coastal: Boolean(coastal), seaNeighbors: coastal ? region.seaNeighbors : [] };
    if (!coastal && removeRoutes && affected.has(region.id)) {
      return { ...region, seaNeighbors: region.seaNeighbors.filter((id) => id !== regionId) };
    }
    return region;
  });
  const map = { ...normalized, regions, regionsById: Object.fromEntries(regions.map((region) => [region.id, region])) };
  return { ok: true, mapDefinition: map, removedRouteCount: current.seaNeighbors.length };
}

export function setNavalRoute(mapDefinition, firstId, secondId, connected) {
  if (!firstId || !secondId || firstId === secondId) {
    return { ok: false, code: 'INVALID_ROUTE', reason: 'Rota için iki farklı bölge seç.' };
  }
  const normalized = normalizeNavalRegions(mapDefinition);
  if (!normalized.regionsById[firstId] || !normalized.regionsById[secondId]) {
    return { ok: false, code: 'UNKNOWN_REGION', reason: 'Rota bölgesi haritada bulunmuyor.' };
  }
  const regions = normalized.regions.map((region) => {
    if (region.id !== firstId && region.id !== secondId) return region;
    const otherId = region.id === firstId ? secondId : firstId;
    return {
      ...region,
      coastal: connected ? true : region.coastal,
      seaNeighbors: connected
        ? uniqueSorted([...region.seaNeighbors, otherId])
        : region.seaNeighbors.filter((id) => id !== otherId),
    };
  });
  return {
    ok: true,
    mapDefinition: { ...normalized, regions, regionsById: Object.fromEntries(regions.map((region) => [region.id, region])) },
    autoMarkedCoastal: connected && (!normalized.regionsById[firstId].coastal || !normalized.regionsById[secondId].coastal),
  };
}
