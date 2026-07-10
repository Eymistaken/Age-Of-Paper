import { PHASES } from './phases';
import { advanceTurn } from './turns';
import { calculateIncome, safeMoney } from './economy';

export const CLAIM_REASONS = Object.freeze({
  AVAILABLE: 'Bu tarafsız bölge satın alınabilir.',
  COMPLETE: 'Toprak edinme evresi tamamlandı.',
  NOT_CLAIMING: 'Toprak yalnızca edinme evresinde satın alınabilir.',
  NOT_ACTIVE: 'Satın almak için kendi sıranı beklemelisin.',
  UNKNOWN_REGION: 'Bu bölge harita tanımında bulunmuyor.',
  OCCUPIED: 'Bu bölge başka bir komutanın yönetiminde.',
  NOT_CONNECTED: 'Yeni bölge mevcut ülkenin claim sınırına bağlı olmalı.',
  INSUFFICIENT_FUNDS: 'Bu bölge için hazinende yeterli altın yok.',
});

function regionsById(mapDefinition) {
  return mapDefinition?.regionsById || Object.fromEntries(
    (mapDefinition?.regions || []).map((region) => [region.id, region]),
  );
}

export function getOwnedRegionIds(claims = {}, playerId) {
  return Object.entries(claims)
    .filter(([, claim]) => claim?.ownerId === playerId)
    .map(([regionId]) => regionId);
}

export function getLegalClaims(mapDefinition, claims = {}, playerId) {
  const byId = regionsById(mapDefinition);
  const owned = new Set(getOwnedRegionIds(claims, playerId));
  const neutralIds = (mapDefinition?.regionIds || Object.keys(byId)).filter((id) => !claims[id]?.ownerId);
  if (owned.size === 0) return neutralIds;
  return neutralIds.filter((id) => byId[id]?.claimNeighbors?.some((neighborId) => owned.has(neighborId)));
}

export function getClaimEligibility({
  phase,
  mapDefinition,
  claims = {},
  playerId,
  regionId,
  money,
  isActive,
}) {
  if (phase === PHASES.CLAIM_COMPLETE) return { legal: false, code: 'COMPLETE', reason: CLAIM_REASONS.COMPLETE };
  if (phase !== PHASES.CLAIMING) return { legal: false, code: 'NOT_CLAIMING', reason: CLAIM_REASONS.NOT_CLAIMING };
  if (!isActive) return { legal: false, code: 'NOT_ACTIVE', reason: CLAIM_REASONS.NOT_ACTIVE };
  const region = regionsById(mapDefinition)[regionId];
  if (!region) return { legal: false, code: 'UNKNOWN_REGION', reason: CLAIM_REASONS.UNKNOWN_REGION };
  if (claims[regionId]?.ownerId) return { legal: false, code: 'OCCUPIED', reason: CLAIM_REASONS.OCCUPIED };
  if (!getLegalClaims(mapDefinition, claims, playerId).includes(regionId)) {
    return { legal: false, code: 'NOT_CONNECTED', reason: CLAIM_REASONS.NOT_CONNECTED };
  }
  if (!Number.isFinite(money) || money < region.price) {
    return { legal: false, code: 'INSUFFICIENT_FUNDS', reason: CLAIM_REASONS.INSUFFICIENT_FUNDS };
  }
  return { legal: true, code: 'AVAILABLE', reason: CLAIM_REASONS.AVAILABLE, region };
}

export function isMapFullyClaimed(mapDefinition, claims = {}) {
  const regionIds = mapDefinition?.regionIds || [];
  return regionIds.length > 0 && regionIds.every((regionId) => Boolean(claims[regionId]?.ownerId));
}

export function releasePlayerClaims(claims = {}, playerId) {
  return Object.fromEntries(
    Object.entries(claims).filter(([, claim]) => claim?.ownerId !== playerId),
  );
}

export function applyClaim(room, playerId, regionId) {
  const player = room.players[playerId];
  const eligibility = getClaimEligibility({
    phase: room.phase,
    mapDefinition: room.mapDefinition,
    claims: room.claims,
    playerId,
    regionId,
    money: player?.money,
    isActive: room.turnOrder?.[room.turnIndex] === playerId,
  });
  if (!eligibility.legal) return { room, eligibility };

  const claims = {
    ...(room.claims || {}),
    [regionId]: { ownerId: playerId, claimedAtTurn: room.turnNumber },
  };
  const players = {
    ...room.players,
    [playerId]: {
      ...player,
      money: safeMoney(player.money) - eligibility.region.price,
      income: calculateIncome(room.mapDefinition, claims, playerId),
      regionIds: [...(player.regionIds || []), regionId],
    },
  };
  const complete = isMapFullyClaimed(room.mapDefinition, claims);
  return {
    eligibility,
    room: {
      ...room,
      ...(!complete ? advanceTurn(room) : {}),
      phase: complete ? PHASES.CLAIM_COMPLETE : PHASES.CLAIMING,
      claims,
      players,
    },
  };
}
