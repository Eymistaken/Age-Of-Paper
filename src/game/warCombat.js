import { calculateIncome } from './economy';
import { PHASES } from './phases';
import { getLandTransferEligibility, getNavalTransferEligibility } from './warMovement';
import { isSoldierAmount } from './warConstants';
import { getNavalTargetEligibility } from './navalPolicy';

export function resolveDeterministicCombat(attacking, defending) {
  if (!isSoldierAmount(attacking) || !Number.isSafeInteger(defending) || defending < 0) return null;
  return attacking > defending
    ? { captured: true, attackersRemaining: attacking - defending, defendersRemaining: 0 }
    : { captured: false, attackersRemaining: 0, defendersRemaining: defending - attacking };
}

function attackBase(room, playerId, sourceId, targetId, amount) {
  if (room?.phase !== PHASES.WAR) return { legal: false, code: 'WRONG_PHASE', reason: 'Saldırı yalnızca savaş evresinde yapılabilir.' };
  if (room.turnOrder?.[room.turnIndex] !== playerId) return { legal: false, code: 'NOT_ACTIVE', reason: 'Sıra sende değil.' };
  if (room.players?.[playerId]?.eliminated) return { legal: false, code: 'ELIMINATED', reason: 'Elendiğin için saldıramazsın.' };
  if (!sourceId || !targetId || sourceId === targetId) return { legal: false, code: 'SAME_REGION', reason: 'Kaynak ve hedef farklı olmalı.' };
  if (!isSoldierAmount(amount)) return { legal: false, code: 'INVALID_AMOUNT', reason: 'Saldırı pozitif 1.000 asker katı olmalı.' };
  const sourceClaim = room.claims?.[sourceId];
  const targetClaim = room.claims?.[targetId];
  if (sourceClaim?.ownerId !== playerId) return { legal: false, code: 'INVALID_SOURCE', reason: 'Kaynak bölge senin değil.' };
  if (targetClaim?.ownerId === playerId) return { legal: false, code: 'FRIENDLY_TARGET', reason: 'Kendi bölgene saldıramazsın.' };
  if ((sourceClaim.soldiers || 0) < amount) return { legal: false, code: 'INSUFFICIENT_SOLDIERS', reason: 'Kaynakta yeterli asker yok.' };
  return {
    legal: true,
    sourceClaim,
    targetClaim: targetClaim || { ownerId: null, soldiers: 0, hasPort: false, ships: 0 },
    sourceRegion: room.mapDefinition?.regionsById?.[sourceId],
    targetRegion: room.mapDefinition?.regionsById?.[targetId],
  };
}

export function getLandAttackEligibility(room, playerId, sourceId, targetId, amount) {
  const base = attackBase(room, playerId, sourceId, targetId, amount);
  if (!base.legal) return base;
  if (!base.sourceRegion?.landNeighbors?.includes(targetId)) return { legal: false, code: 'NOT_ADJACENT', reason: 'Hedef kaynak bölgenin doğrudan kara komşusu değil.' };
  return base;
}

export function getNavalAttackEligibility(room, playerId, sourceId, targetId, amount) {
  return getNavalTargetEligibility(room, playerId, 'attack', sourceId, targetId, amount);
}

export function applyAttack(room, playerId, sourceId, targetId, amount, type) {
  const eligibility = type === 'naval'
    ? getNavalAttackEligibility(room, playerId, sourceId, targetId, amount)
    : getLandAttackEligibility(room, playerId, sourceId, targetId, amount);
  if (!eligibility.legal) return { room, eligibility };
  const previousOwnerId = eligibility.targetClaim.ownerId || null;
  const result = resolveDeterministicCombat(amount, eligibility.targetClaim.soldiers || 0);
  const claims = {
    ...room.claims,
    [sourceId]: { ...eligibility.sourceClaim, soldiers: eligibility.sourceClaim.soldiers - amount },
    [targetId]: {
      ...eligibility.targetClaim,
      ownerId: result.captured ? playerId : previousOwnerId,
      soldiers: result.captured ? result.attackersRemaining : result.defendersRemaining,
      ships: result.captured ? 0 : (eligibility.targetClaim.ships || 0),
    },
  };
  let players = room.players;
  if (result.captured) {
    players = {
      ...players,
      [playerId]: {
        ...players[playerId],
        regionIds: [...new Set([...(players[playerId].regionIds || []), targetId])],
      },
    };
    if (previousOwnerId && players[previousOwnerId]) {
      players[previousOwnerId] = {
        ...players[previousOwnerId],
        regionIds: (players[previousOwnerId].regionIds || []).filter((id) => id !== targetId),
      };
    }
    players[playerId].income = calculateIncome(room.mapDefinition, claims, playerId);
    if (previousOwnerId && players[previousOwnerId]) {
      players[previousOwnerId].income = calculateIncome(room.mapDefinition, claims, previousOwnerId);
    }
  }
  return {
    eligibility: { ...eligibility, previousOwnerId, result },
    room: { ...room, claims, players },
  };
}

// Keep these imports exercised as the single movement/combat public surface evolves.
export { getLandTransferEligibility, getNavalTransferEligibility };
