import { summarizeRegionEconomy } from './pricing';

export const SAFE_REGION_ID = /^[A-Za-z_][A-Za-z0-9_-]{0,79}$/;

function issue(code, message, regionId) {
  return regionId ? { code, message, regionId } : { code, message };
}

function getRegions(mapDefinition) {
  if (Array.isArray(mapDefinition?.regions)) return mapDefinition.regions;
  if (mapDefinition?.regionsById && typeof mapDefinition.regionsById === 'object') {
    return Object.values(mapDefinition.regionsById);
  }
  return [];
}

function visit(start, adjacency) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    for (const neighbor of adjacency.get(current) || []) {
      if (!seen.has(neighbor)) {
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return seen;
}

export function validateMapDefinition(mapDefinition) {
  const errors = [];
  const warnings = [];
  const regions = getRegions(mapDefinition);

  for (const importedIssue of Array.isArray(mapDefinition?.importIssues) ? mapDefinition.importIssues : []) {
    (importedIssue.severity === 'error' ? errors : warnings).push(importedIssue);
  }

  if (mapDefinition?.version !== 1) {
    errors.push(issue('UNSUPPORTED_VERSION', 'Harita tanımı sürümü desteklenmiyor.'));
  }

  if (regions.length === 0) {
    errors.push(issue('NO_REGIONS', 'Haritada oynanabilir bölge bulunamadı.'));
    return { valid: false, errors, warnings, regionCount: 0, pricingSummary: null };
  }

  if (!Array.isArray(mapDefinition?.regionIds)) {
    errors.push(issue('INVALID_REGION_INDEX', 'Harita tanımının regionIds alanı bir liste olmalı.'));
  }

  const ids = new Set();
  for (const region of regions) {
    if (!SAFE_REGION_ID.test(region?.id || '')) {
      errors.push(issue('UNSAFE_ID', `“${region?.id || '(boş)'}” güvenli bir bölge kimliği değil.`, region?.id));
    } else if (ids.has(region.id)) {
      errors.push(issue('DUPLICATE_ID', `“${region.id}” bölge kimliği birden fazla kullanılmış.`, region.id));
    }
    ids.add(region?.id);

    if (typeof region?.name !== 'string' || !region.name.trim()) {
      errors.push(issue('INVALID_NAME', `“${region?.id || '(boş)'}” için bölge adı gerekli.`, region?.id));
    }
    if (typeof region?.coastal !== 'boolean') {
      errors.push(issue('INVALID_COASTAL', `“${region?.id || '(boş)'}” için coastal true veya false olmalı.`, region?.id));
    }
    if (region?.portAllowed !== undefined && typeof region.portAllowed !== 'boolean') {
      errors.push(issue('INVALID_PORT_ALLOWED', `“${region?.id || '(boş)'}” için portAllowed true veya false olmalı.`, region?.id));
    }
    if (region?.portAllowed === true && region?.coastal !== true) {
      errors.push(issue('INLAND_PORT_ALLOWED', `“${region?.id || '(boş)'}” kıyı değilken limana izin veremez.`, region?.id));
    }
    if (region?.terrainType !== undefined && region.terrainType !== 'land') {
      errors.push(issue('NON_LAND_PLAYABLE', `“${region?.id || '(boş)'}” oynanabilir tanımda yalnızca kara olabilir.`, region?.id));
    }

    for (const field of ['price', 'income']) {
      if (!Number.isFinite(region?.[field]) || region[field] < 0) {
        errors.push(issue('INVALID_NUMBER', `“${region?.name || region?.id}” için ${field} geçersiz veya negatif.`, region?.id));
      }
    }

    for (const neighborField of ['landNeighbors', 'claimNeighbors', 'seaNeighbors']) {
      if (!Array.isArray(region?.[neighborField])) {
        errors.push(issue('INVALID_NEIGHBORS', `“${region?.id}” için ${neighborField} bir liste olmalı.`, region?.id));
      }
    }
  }

  if (Array.isArray(mapDefinition?.regionIds)) {
    const indexedIds = new Set(mapDefinition.regionIds);
    if (indexedIds.size !== mapDefinition.regionIds.length
      || indexedIds.size !== ids.size
      || [...ids].some((id) => !indexedIds.has(id))) {
      errors.push(issue('INVALID_REGION_INDEX', 'regionIds listesi oynanabilir bölge kayıtlarıyla birebir eşleşmiyor.'));
    }
  }

  const byId = new Map(regions.map((region) => [region.id, region]));
  const adjacency = new Map(regions.map((region) => [region.id, []]));
  const reverse = new Map(regions.map((region) => [region.id, []]));

  for (const region of regions) {
    for (const field of ['landNeighbors', 'claimNeighbors', 'seaNeighbors']) {
      const seenNeighbors = new Set();
      for (const neighborId of Array.isArray(region[field]) ? region[field] : []) {
        if (seenNeighbors.has(neighborId)) {
          errors.push(issue('DUPLICATE_ROUTE', `“${region.id}” için “${neighborId}” bağlantısı yineleniyor.`, region.id));
        } else if (neighborId === region.id) {
          errors.push(issue('SELF_NEIGHBOR', `“${region.id}” kendisine komşu olamaz.`, region.id));
        } else if (!byId.has(neighborId)) {
          errors.push(issue('UNKNOWN_NEIGHBOR', `“${region.id}”, bilinmeyen “${neighborId}” bölgesine bağlanıyor.`, region.id));
        }
        seenNeighbors.add(neighborId);
      }
    }

    for (const neighborId of Array.isArray(region.seaNeighbors) ? region.seaNeighbors : []) {
      const neighbor = byId.get(neighborId);
      if (!region.coastal || (neighbor && !neighbor.coastal)) {
        errors.push(issue('NON_COASTAL_ROUTE', `“${region.id}” deniz rotası yalnızca kıyı bölgelerini bağlayabilir.`, region.id));
      }
      if (neighbor && !neighbor.seaNeighbors?.includes(region.id)) {
        errors.push(issue('ASYMMETRIC_SEA_ROUTE', `“${region.id}” ile “${neighborId}” arasındaki deniz rotası çift yönlü olmalı.`, region.id));
      }
    }

    for (const neighborId of Array.isArray(region.claimNeighbors) ? region.claimNeighbors : []) {
      if (byId.has(neighborId) && neighborId !== region.id) {
        adjacency.get(region.id).push(neighborId);
        reverse.get(neighborId).push(region.id);
        if (!byId.get(neighborId)?.claimNeighbors?.includes(region.id)) {
          warnings.push(issue('ASYMMETRIC_CLAIM', `“${region.id}” → “${neighborId}” claim bağlantısı tek yönlü.`, region.id));
        }
      }
    }
  }

  if (regions.length > 1) {
    const start = regions[0].id;
    const forward = visit(start, adjacency);
    const backward = visit(start, reverse);
    if (forward.size !== regions.length || backward.size !== regions.length) {
      const unreachable = regions
        .filter((region) => !forward.has(region.id) || !backward.has(region.id))
        .map((region) => region.name || region.id)
        .slice(0, 6)
        .join(', ');
      errors.push(issue(
        'UNREACHABLE_REGION',
        `Claim grafiği her başlangıçtan tamamlanamıyor. Ulaşılamayan bölgeler: ${unreachable}.`,
      ));
    }
  }

  if (regions.some((region) => region.coastal) && !regions.some((region) => region.seaNeighbors?.length)) {
    warnings.push(issue('COASTAL_WITHOUT_ROUTES', 'Kıyı bölgeleri var, ancak deniz rotası yapılandırılmamış. Harita kara oyunu için yine kullanılabilir.'));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    regionCount: regions.length,
    pricingSummary: summarizeRegionEconomy(regions),
  };
}
