import { PHASES } from './phases';
import { isSoldierAmount } from './warConstants';
import { getNavalTargetEligibility } from './navalPolicy';

function baseEligibility(room, playerId, sourceId, targetId, amount) {
  if (room?.phase !== PHASES.WAR) return { legal: false, code: 'WRONG_PHASE', reason: 'Harekât yalnızca savaş evresinde yapılabilir.' };
  if (room.turnOrder?.[room.turnIndex] !== playerId) return { legal: false, code: 'NOT_ACTIVE', reason: 'Sıra sende değil.' };
  if (room.players?.[playerId]?.eliminated) return { legal: false, code: 'ELIMINATED', reason: 'Elendiğin için emir veremezsin.' };
  if (!sourceId || !targetId || sourceId === targetId) return { legal: false, code: 'SAME_REGION', reason: 'Kaynak ve hedef farklı olmalı.' };
  if (!isSoldierAmount(amount)) return { legal: false, code: 'INVALID_AMOUNT', reason: 'Asker sayısı pozitif 1.000 katı olmalı.' };
  const sourceClaim = room.claims?.[sourceId];
  const targetClaim = room.claims?.[targetId];
  if (sourceClaim?.ownerId !== playerId) return { legal: false, code: 'INVALID_SOURCE', reason: 'Kaynak bölge senin değil.' };
  if ((sourceClaim.soldiers || 0) < amount) return { legal: false, code: 'INSUFFICIENT_SOLDIERS', reason: 'Kaynakta yeterli asker yok.' };
  return { legal: true, sourceClaim, targetClaim, sourceRegion: room.mapDefinition?.regionsById?.[sourceId], targetRegion: room.mapDefinition?.regionsById?.[targetId] };
}

export function findFriendlyLandPath(mapDefinition, claims, playerId, sourceId, targetId) {
  if (sourceId === targetId) return [sourceId];
  const seen = new Set([sourceId]);
  const queue = [[sourceId]];
  while (queue.length) {
    const path = queue.shift();
    const current = path.at(-1);
    for (const neighbor of mapDefinition?.regionsById?.[current]?.landNeighbors || []) {
      if (seen.has(neighbor) || claims?.[neighbor]?.ownerId !== playerId) continue;
      const nextPath = [...path, neighbor];
      if (neighbor === targetId) return nextPath;
      seen.add(neighbor);
      queue.push(nextPath);
    }
  }
  return null;
}

export function hasFriendlyLandPath(mapDefinition, claims, playerId, sourceId, targetId) {
  return Boolean(findFriendlyLandPath(mapDefinition, claims, playerId, sourceId, targetId));
}

export function getLandTransferEligibility(room, playerId, sourceId, targetId, amount) {
  const base = baseEligibility(room, playerId, sourceId, targetId, amount);
  if (!base.legal) return base;
  if (base.targetClaim?.ownerId !== playerId) return { legal: false, code: 'INVALID_TARGET', reason: 'Hedef bölge senin değil.' };
  const path = findFriendlyLandPath(room.mapDefinition, room.claims, playerId, sourceId, targetId);
  if (!path) {
    return { legal: false, code: 'NO_FRIENDLY_PATH', reason: 'Bölgeler dost kara hattıyla bağlı değil.' };
  }
  return { ...base, path };
}

export function getNavalTransferEligibility(room, playerId, sourceId, targetId, amount) {
  return getNavalTargetEligibility(room, playerId, 'move', sourceId, targetId, amount);
}

export function applyTransfer(room, playerId, sourceId, targetId, amount, type) {
  const eligibility = type === 'naval'
    ? getNavalTransferEligibility(room, playerId, sourceId, targetId, amount)
    : getLandTransferEligibility(room, playerId, sourceId, targetId, amount);
  if (!eligibility.legal) return { room, eligibility };
  return {
    eligibility,
    room: {
      ...room,
      claims: {
        ...room.claims,
        [sourceId]: { ...eligibility.sourceClaim, soldiers: eligibility.sourceClaim.soldiers - amount },
        [targetId]: { ...eligibility.targetClaim, soldiers: (eligibility.targetClaim.soldiers || 0) + amount },
      },
    },
  };
}
