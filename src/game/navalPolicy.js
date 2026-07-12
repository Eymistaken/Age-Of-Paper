import { PHASES } from './phases';
import { isSoldierAmount, requiredShips, SOLDIER_BATCH } from './warConstants';

export const NAVAL_POLICIES = Object.freeze({
  ALL_COASTS: 'all_coasts',
  SELECTED_ROUTES: 'selected_routes',
  DISABLED: 'disabled',
});

export const NAVAL_POLICY_VALUES = Object.freeze(Object.values(NAVAL_POLICIES));

const NAVAL_POLICY_SET = new Set(NAVAL_POLICY_VALUES);
const COAST_TYPES = new Set(['ocean', 'lake', 'both']);

function regionsById(source) {
  return source?.regionsById || Object.fromEntries((source?.regions || []).map((region) => [region.id, region]));
}

export function normalizeRoutePair(firstOrPair, secondValue) {
  const values = typeof firstOrPair === 'string' && secondValue === undefined && firstOrPair.includes('::')
    ? firstOrPair.split('::')
    : Array.isArray(firstOrPair) ? firstOrPair : [firstOrPair, secondValue];
  if (values.length !== 2) return null;
  const first = typeof values[0] === 'string' ? values[0].trim() : '';
  const second = typeof values[1] === 'string' ? values[1].trim() : '';
  if (!first || !second || first === second) return null;
  return [first, second].sort((a, b) => a.localeCompare(b));
}

export function navalRouteKey(firstOrPair, secondValue) {
  const pair = normalizeRoutePair(firstOrPair, secondValue);
  return pair ? `${pair[0]}::${pair[1]}` : '';
}

export function isFinalCoastalLand(region, { allowLegacy = true } = {}) {
  if (!region || region.terrainType && region.terrainType !== 'land') return false;
  if (COAST_TYPES.has(region.coastType)) return region.coastal !== false;
  return allowLegacy && region.coastType === undefined && region.coastal === true;
}

export function normalizeRouteList(routes = [], { mapDefinition, surfacesById, keepInvalid = false } = {}) {
  const known = surfacesById || regionsById(mapDefinition);
  const validateEndpoints = Object.keys(known).length > 0;
  const normalized = [];
  const invalid = [];
  const seen = new Set();
  for (const candidate of Array.isArray(routes) ? routes : []) {
    const pair = normalizeRoutePair(candidate);
    const key = navalRouteKey(pair);
    const valid = pair && (!validateEndpoints || (
      isFinalCoastalLand(known[pair[0]]) && isFinalCoastalLand(known[pair[1]])
    ));
    if (!valid || seen.has(key)) {
      if (pair && !seen.has(key)) invalid.push(pair);
      continue;
    }
    seen.add(key);
    normalized.push(pair);
  }
  normalized.sort((a, b) => navalRouteKey(a).localeCompare(navalRouteKey(b)));
  invalid.sort((a, b) => navalRouteKey(a).localeCompare(navalRouteKey(b)));
  return keepInvalid ? { routes: normalized, invalidRoutes: invalid } : normalized;
}

export function listLegacySeaRoutes(mapDefinition) {
  const regions = regionsById(mapDefinition);
  const routes = [];
  for (const id of mapDefinition?.regionIds || Object.keys(regions)) {
    for (const neighborId of regions[id]?.seaNeighbors || []) {
      if (regions[neighborId]?.seaNeighbors?.includes(id)) routes.push([id, neighborId]);
    }
  }
  return normalizeRouteList(routes, { mapDefinition });
}

export function migrateLegacyNavalPolicy(source = {}, { defaultPolicy = NAVAL_POLICIES.ALL_COASTS, mapDefinition = source } = {}) {
  const explicitPolicy = NAVAL_POLICY_SET.has(source.navalPolicy) ? source.navalPolicy : null;
  const legacyRoutes = [
    ...(Array.isArray(source.compatibilityRoutes) ? source.compatibilityRoutes : []),
    ...listLegacySeaRoutes(mapDefinition),
  ];
  const allowedSource = Array.isArray(source.allowedRoutes) ? source.allowedRoutes : legacyRoutes;
  return {
    navalPolicy: explicitPolicy || (legacyRoutes.length ? NAVAL_POLICIES.SELECTED_ROUTES : defaultPolicy),
    allowedRoutes: normalizeRouteList(allowedSource, { mapDefinition }),
    blockedRoutes: normalizeRouteList(source.blockedRoutes, { mapDefinition }),
    migratedLegacyRoutes: !explicitPolicy && legacyRoutes.length > 0,
  };
}

export function normalizeNavalConfig(source = {}, options = {}) {
  const migrated = migrateLegacyNavalPolicy(source, options);
  return {
    navalPolicy: migrated.navalPolicy,
    allowedRoutes: migrated.allowedRoutes,
    blockedRoutes: migrated.blockedRoutes,
  };
}

export function resetNavalRoutes(source = {}) {
  return { ...source, allowedRoutes: [], blockedRoutes: [] };
}

export function applyNavalPolicyEdit(mapDefinition, edit) {
  const config = normalizeNavalConfig(mapDefinition, {
    mapDefinition,
    defaultPolicy: NAVAL_POLICIES.SELECTED_ROUTES,
  });
  if (edit?.type === 'policy' && NAVAL_POLICY_SET.has(edit.navalPolicy)) {
    return { ok: true, mapDefinition: {
      ...mapDefinition,
      ...config,
      navalPolicy: edit.navalPolicy,
      allowedRoutes: config.allowedRoutes.map(navalRouteKey),
      blockedRoutes: config.blockedRoutes.map(navalRouteKey),
    } };
  }
  if (edit?.type === 'reset_routes') {
    return { ok: true, mapDefinition: { ...mapDefinition, ...config, allowedRoutes: [], blockedRoutes: [] } };
  }
  if (edit?.type !== 'route') return { ok: false, code: 'INVALID_NAVAL_EDIT', reason: 'Deniz politikası işlemi tanınmıyor.' };
  const pair = normalizeRoutePair(edit.firstId, edit.secondId);
  const regions = regionsById(mapDefinition);
  if (!pair || !isFinalCoastalLand(regions[pair[0]]) || !isFinalCoastalLand(regions[pair[1]])) {
    return { ok: false, code: 'INVALID_ROUTE_ENDPOINT', reason: 'Rota uçları nihai kıyı kara bölgeleri olmalı.' };
  }
  const key = navalRouteKey(pair);
  const field = config.navalPolicy === NAVAL_POLICIES.ALL_COASTS ? 'blockedRoutes' : 'allowedRoutes';
  const shouldContain = config.navalPolicy === NAVAL_POLICIES.ALL_COASTS ? edit.allowed === false : edit.allowed !== false;
  const current = config[field];
  const next = shouldContain
    ? normalizeRouteList([...current, pair], { mapDefinition })
    : current.filter((route) => navalRouteKey(route) !== key);
  return { ok: true, mapDefinition: {
    ...mapDefinition,
    ...config,
    allowedRoutes: (field === 'allowedRoutes' ? next : config.allowedRoutes).map(navalRouteKey),
    blockedRoutes: (field === 'blockedRoutes' ? next : config.blockedRoutes).map(navalRouteKey),
  } };
}

export function isNavalRouteAllowed(mapDefinition, firstId, secondId) {
  const pair = normalizeRoutePair(firstId, secondId);
  const regions = regionsById(mapDefinition);
  const config = normalizeNavalConfig(mapDefinition, {
    mapDefinition,
    defaultPolicy: NAVAL_POLICIES.SELECTED_ROUTES,
  });
  if (config.navalPolicy === NAVAL_POLICIES.DISABLED) {
    return { allowed: false, code: 'NAVAL_DISABLED', reason: 'Deniz politikası kapalı.' };
  }
  if (!pair || !isFinalCoastalLand(regions[pair?.[0]]) || !isFinalCoastalLand(regions[pair?.[1]])) {
    return { allowed: false, code: 'STALE_COAST', reason: 'Kaynak veya hedef artık geçerli bir kıyı değil.' };
  }
  const key = navalRouteKey(pair);
  if (config.navalPolicy === NAVAL_POLICIES.ALL_COASTS) {
    const blocked = config.blockedRoutes.some((route) => navalRouteKey(route) === key);
    return blocked
      ? { allowed: false, code: 'ROUTE_BLOCKED', reason: 'Rota engelli.' }
      : { allowed: true, code: 'AVAILABLE' };
  }
  const allowed = config.allowedRoutes.some((route) => navalRouteKey(route) === key);
  return allowed
    ? { allowed: true, code: 'AVAILABLE' }
    : { allowed: false, code: 'NO_SELECTED_ROUTE', reason: 'Özel rota bulunmuyor.' };
}

export function requiredNavalCapacity(amount) {
  return { shipsNeeded: requiredShips(amount), soldierBatch: SOLDIER_BATCH };
}

function operationBase(room, playerId, sourceId, targetId, amount) {
  if (room?.phase !== PHASES.WAR) return { legal: false, code: 'WRONG_PHASE', reason: 'Harekât yalnızca savaş evresinde yapılabilir.' };
  if (room.turnOrder?.[room.turnIndex] !== playerId) return { legal: false, code: 'NOT_ACTIVE', reason: 'Sıra sende değil.' };
  if (room.players?.[playerId]?.eliminated) return { legal: false, code: 'ELIMINATED', reason: 'Elendiğin için emir veremezsin.' };
  if (!sourceId || !targetId || sourceId === targetId) return { legal: false, code: 'SAME_REGION', reason: 'Kaynak ve hedef farklı olmalı.' };
  const sourceClaim = room.claims?.[sourceId];
  const targetClaim = room.claims?.[targetId];
  if (sourceClaim?.ownerId !== playerId) return { legal: false, code: 'INVALID_SOURCE', reason: 'Kaynak bölge senin değil.' };
  const route = isNavalRouteAllowed(room.mapDefinition, sourceId, targetId);
  if (!route.allowed) return { legal: false, ...route };
  if (!isSoldierAmount(amount) || (sourceClaim.soldiers || 0) < amount) {
    return { legal: false, code: 'INSUFFICIENT_SOLDIERS', reason: 'Yetersiz asker.' };
  }
  if (!sourceClaim.hasPort) return { legal: false, code: 'PORT_REQUIRED', reason: 'Liman gerekli.' };
  const shipsNeeded = requiredShips(amount);
  if ((sourceClaim.ships || 0) < shipsNeeded) {
    return { legal: false, code: 'INSUFFICIENT_SHIPS', reason: 'Yetersiz gemi kapasitesi.', shipsNeeded };
  }
  return {
    legal: true,
    code: 'AVAILABLE',
    sourceClaim,
    targetClaim: targetClaim || { ownerId: null, soldiers: 0, hasPort: false, ships: 0 },
    sourceRegion: regionsById(room.mapDefinition)[sourceId],
    targetRegion: regionsById(room.mapDefinition)[targetId],
    shipsNeeded,
  };
}

export function getNavalTargetEligibility(room, playerId, operation, sourceId, targetId, amount) {
  const base = operationBase(room, playerId, sourceId, targetId, amount);
  if (!base.legal) return base;
  if (operation === 'move' && base.targetClaim?.ownerId !== playerId) {
    return { legal: false, code: 'ENEMY_TRANSFER_TARGET', reason: 'Bu hedef nakil için düşman bölgesi.' };
  }
  if (operation === 'attack' && base.targetClaim?.ownerId === playerId) {
    return { legal: false, code: 'FRIENDLY_ATTACK_TARGET', reason: 'Bu hedef saldırı için sana ait.' };
  }
  return base;
}

export function getPlayerNavalCapability(room, playerId) {
  const regions = regionsById(room?.mapDefinition);
  const policy = normalizeNavalConfig(room?.mapDefinition, {
    mapDefinition: room?.mapDefinition,
    defaultPolicy: NAVAL_POLICIES.SELECTED_ROUTES,
  }).navalPolicy;
  const ownedCoasts = Object.keys(regions).filter((id) => (
    room?.claims?.[id]?.ownerId === playerId && isFinalCoastalLand(regions[id])
  ));
  const eligibleCoasts = ownedCoasts.filter((id) => regions[id].portAllowed !== false);
  const reachableBySource = Object.fromEntries(eligibleCoasts.map((sourceId) => [sourceId,
    Object.keys(regions).filter((targetId) => targetId !== sourceId && isNavalRouteAllowed(room.mapDefinition, sourceId, targetId).allowed),
  ]));
  const accessibleTargets = [...new Set(Object.values(reachableBySource).flat())];
  const ports = eligibleCoasts.filter((id) => room?.claims?.[id]?.hasPort);
  const ships = ports.reduce((total, id) => total + Math.max(0, room?.claims?.[id]?.ships || 0), 0);
  const available = policy !== NAVAL_POLICIES.DISABLED && eligibleCoasts.length > 0 && accessibleTargets.length > 0;
  return {
    policy,
    available,
    showNavalSection: available,
    ownedCoasts,
    eligibleCoasts,
    reachableBySource,
    accessibleTargets,
    ports,
    ships,
    hasPort: ports.length > 0,
  };
}
