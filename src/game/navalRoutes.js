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

function validateRouteEndpoints(mapDefinition, firstId, secondId) {
  if (!firstId || !secondId || firstId === secondId) {
    return { ok: false, code: 'INVALID_ROUTE', reason: 'Rota için iki farklı bölge seç.' };
  }
  const normalized = normalizeNavalRegions(mapDefinition);
  if (!normalized.regionsById[firstId] || !normalized.regionsById[secondId]) {
    return { ok: false, code: 'UNKNOWN_REGION', reason: 'Rota bölgesi haritada bulunmuyor.' };
  }
  return { ok: true, normalized };
}

export function createNavalRoute(mapDefinition, firstId, secondId) {
  const endpoints = validateRouteEndpoints(mapDefinition, firstId, secondId);
  if (!endpoints.ok) return endpoints;
  const { normalized } = endpoints;
  const alreadyConnected = normalized.regionsById[firstId].seaNeighbors.includes(secondId)
    || normalized.regionsById[secondId].seaNeighbors.includes(firstId);
  if (alreadyConnected) {
    return { ok: false, code: 'DUPLICATE_ROUTE', reason: 'Bu iki bölge arasında zaten bir deniz rotası var.' };
  }
  const autoMarkedRegionIds = [firstId, secondId]
    .filter((regionId) => !normalized.regionsById[regionId].coastal);
  const regions = normalized.regions.map((region) => {
    if (region.id !== firstId && region.id !== secondId) return region;
    const otherId = region.id === firstId ? secondId : firstId;
    return {
      ...region,
      coastal: true,
      seaNeighbors: uniqueSorted([...region.seaNeighbors, otherId]),
    };
  });
  return {
    ok: true,
    mapDefinition: { ...normalized, regions, regionsById: Object.fromEntries(regions.map((region) => [region.id, region])) },
    autoMarkedCoastal: autoMarkedRegionIds.length > 0,
    autoMarkedRegionIds,
  };
}

export function removeNavalRoute(mapDefinition, firstId, secondId) {
  const endpoints = validateRouteEndpoints(mapDefinition, firstId, secondId);
  if (!endpoints.ok) return endpoints;
  const { normalized } = endpoints;
  const connected = normalized.regionsById[firstId].seaNeighbors.includes(secondId)
    && normalized.regionsById[secondId].seaNeighbors.includes(firstId);
  if (!connected) {
    return { ok: false, code: 'ROUTE_NOT_FOUND', reason: 'Kaldırılacak deniz rotası bulunamadı.' };
  }
  const regions = normalized.regions.map((region) => {
    if (region.id !== firstId && region.id !== secondId) return region;
    const otherId = region.id === firstId ? secondId : firstId;
    return { ...region, seaNeighbors: region.seaNeighbors.filter((id) => id !== otherId) };
  });
  return {
    ok: true,
    mapDefinition: { ...normalized, regions, regionsById: Object.fromEntries(regions.map((region) => [region.id, region])) },
  };
}

export function setNavalRoute(mapDefinition, firstId, secondId, connected) {
  return connected
    ? createNavalRoute(mapDefinition, firstId, secondId)
    : removeNavalRoute(mapDefinition, firstId, secondId);
}

export function applyNavalMapEdit(mapDefinition, edit) {
  if (edit?.type === 'coastal') {
    return setRegionCoastal(mapDefinition, edit.regionId, edit.coastal, {
      removeRoutes: edit.removeRoutes === true,
    });
  }
  if (edit?.type === 'create_route') {
    return createNavalRoute(mapDefinition, edit.firstId, edit.secondId);
  }
  if (edit?.type === 'remove_route') {
    return removeNavalRoute(mapDefinition, edit.firstId, edit.secondId);
  }
  if (edit?.type === 'route') {
    return setNavalRoute(mapDefinition, edit.firstId, edit.secondId, edit.connected !== false);
  }
  return { ok: false, code: 'INVALID_NAVAL_EDIT', reason: 'Deniz altyapısı işlemi tanınmıyor.' };
}
