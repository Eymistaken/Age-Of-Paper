import { calculateIncome } from './economy';
import { PHASES } from './phases';
import { advanceTurn, getActivePlayerId, removePlayerFromTurnState } from './turns';
import { applyAttack } from './warCombat';
import { grantTurnIncome } from './warEconomy';
import { applyTransfer } from './warMovement';
import { INITIAL_REGION_SOLDIERS } from './warConstants';

function owningPlayerIds(room) {
  const owners = new Set(Object.values(room.claims || {}).map((claim) => claim?.ownerId).filter(Boolean));
  return Object.keys(room.players || {}).filter((id) => owners.has(id) && !room.players[id]?.eliminated);
}

function nextSurvivingId(oldOrder, oldIndex, survivingIds) {
  const surviving = new Set(survivingIds);
  for (let step = 1; step <= oldOrder.length; step += 1) {
    const candidate = oldOrder[(oldIndex + step) % oldOrder.length];
    if (surviving.has(candidate)) return candidate;
  }
  return survivingIds[0] || null;
}

export function resolveVictory(room) {
  if (![PHASES.CLAIM_COMPLETE, PHASES.MOBILIZATION, PHASES.WAR].includes(room?.phase)) return room;
  const contenders = owningPlayerIds(room);
  if (contenders.length !== 1) return { ...room, winnerId: null };
  return {
    ...room,
    phase: PHASES.FINISHED,
    winnerId: contenders[0],
    mobilizationTurnsRemaining: 0,
    mobilizationPending: [],
  };
}

export function startMobilizationState(room, hostId) {
  if (room?.phase !== PHASES.CLAIM_COMPLETE) return { room, eligibility: { legal: false, code: 'WRONG_PHASE', reason: 'Seferberlik yalnızca toprak edinme özeti üzerinden başlatılır.' } };
  if (room.hostId !== hostId) return { room, eligibility: { legal: false, code: 'HOST_ONLY', reason: 'Seferberliği yalnızca kurucu başlatabilir.' } };
  const oldOrder = room.turnOrder || [];
  const ownerIds = new Set(Object.values(room.claims || {}).map((claim) => claim?.ownerId).filter(Boolean));
  const turnOrder = oldOrder.filter((id) => room.players?.[id] && ownerIds.has(id));
  if (!turnOrder.length) return { room, eligibility: { legal: false, code: 'NO_ACTIVE_PLAYERS', reason: 'Seferberliğe katılacak bölge sahibi yok.' } };
  const nextId = nextSurvivingId(oldOrder, room.turnIndex || 0, turnOrder);
  const wrapped = oldOrder.indexOf(nextId) <= (room.turnIndex || 0);
  const players = Object.fromEntries(Object.entries(room.players || {}).map(([id, player]) => [id, {
    ...player,
    eliminated: !ownerIds.has(id),
    income: calculateIncome(room.mapDefinition, room.claims, id),
  }]));
  const claims = Object.fromEntries(Object.entries(room.claims || {}).map(([id, claim]) => [id, {
    ...claim,
    soldiers: INITIAL_REGION_SOLDIERS,
    hasPort: false,
    ships: 0,
  }]));
  let next = {
    ...room,
    phase: PHASES.MOBILIZATION,
    players,
    claims,
    turnOrder,
    turnIndex: Math.max(0, turnOrder.indexOf(nextId)),
    turnNumber: Math.max(0, room.turnNumber || 0) + 1,
    roundNumber: Math.max(1, room.roundNumber || 1) + (wrapped ? 1 : 0),
    mobilizationTurnsRemaining: turnOrder.length,
    mobilizationPending: [...turnOrder],
    winnerId: null,
    completedAt: null,
  };
  next = grantTurnIncome(next).room;
  return { room: next, eligibility: { legal: true, code: 'AVAILABLE' } };
}

export function applyMobilizationReady(room, playerId, { grantIncome = true } = {}) {
  const working = grantIncome ? grantTurnIncome(room, playerId).room : room;
  if (working.phase !== PHASES.MOBILIZATION) return { room, eligibility: { legal: false, code: 'WRONG_PHASE', reason: 'Hazır emri yalnızca seferberlikte verilir.' } };
  if (getActivePlayerId(working) !== playerId) return { room, eligibility: { legal: false, code: 'NOT_ACTIVE', reason: 'Sıra sende değil.' } };
  if (!working.mobilizationPending?.includes(playerId)) return { room, eligibility: { legal: false, code: 'ALREADY_READY', reason: 'Bu seferberlik turunu zaten tamamladın.' } };
  const pending = working.mobilizationPending.filter((id) => id !== playerId);
  const advanced = advanceTurn(working);
  let next = {
    ...working,
    ...advanced,
    phase: pending.length ? PHASES.MOBILIZATION : PHASES.WAR,
    mobilizationPending: pending,
    mobilizationTurnsRemaining: pending.length,
  };
  if (!pending.length) next = resolveVictory(next);
  if (next.phase !== PHASES.FINISHED) next = grantTurnIncome(next).room;
  return { room: next, eligibility: { legal: true, code: 'AVAILABLE' } };
}

function finalizeOperation(working, playerId, result) {
  if (!result.eligibility.legal) return result;
  let next = result.room;
  const previousOwnerId = result.eligibility.previousOwnerId;
  if (previousOwnerId && next.players?.[previousOwnerId]?.regionIds?.length === 0) {
    next = {
      ...next,
      players: {
        ...next.players,
        [previousOwnerId]: { ...next.players[previousOwnerId], eliminated: true },
      },
    };
    next = removePlayerFromTurnState(next, previousOwnerId);
  }
  next = resolveVictory(next);
  if (next.phase === PHASES.FINISHED) {
    next = { ...next, turnNumber: Math.max(0, next.turnNumber || 0) + 1 };
  } else {
    next = advanceTurn(next);
    next = grantTurnIncome(next).room;
  }
  return { ...result, room: next, actorId: playerId };
}

export function applyWarTransfer(room, playerId, sourceId, targetId, amount, type) {
  const working = grantTurnIncome(room, playerId).room;
  return finalizeOperation(working, playerId, applyTransfer(working, playerId, sourceId, targetId, amount, type));
}

export function applyWarAttack(room, playerId, sourceId, targetId, amount, type) {
  const working = grantTurnIncome(room, playerId).room;
  return finalizeOperation(working, playerId, applyAttack(working, playerId, sourceId, targetId, amount, type));
}

export function applyWarEndTurn(room, playerId, { grantIncome = true } = {}) {
  const working = grantIncome ? grantTurnIncome(room, playerId).room : room;
  if (working.phase !== PHASES.WAR) return { room, eligibility: { legal: false, code: 'WRONG_PHASE', reason: 'Tur yalnızca savaş evresinde bitirilebilir.' } };
  if (getActivePlayerId(working) !== playerId) return { room, eligibility: { legal: false, code: 'NOT_ACTIVE', reason: 'Sıra sende değil.' } };
  let next = advanceTurn(working);
  next = grantTurnIncome(next).room;
  return { room: next, eligibility: { legal: true, code: 'AVAILABLE' } };
}

export function surrenderPlayerState(room, playerId) {
  if (![PHASES.CLAIM_COMPLETE, PHASES.MOBILIZATION, PHASES.WAR].includes(room?.phase) || !room.players?.[playerId]) return { room, surrendered: false };
  const players = { ...room.players };
  delete players[playerId];
  const claims = Object.fromEntries(Object.entries(room.claims || {}).map(([id, claim]) => [id,
    claim.ownerId === playerId ? { ...claim, ownerId: null, soldiers: 0, ships: 0 } : claim,
  ]));
  let next = {
    ...room,
    players,
    claims,
    mobilizationPending: (room.mobilizationPending || []).filter((id) => id !== playerId),
  };
  next.mobilizationTurnsRemaining = next.mobilizationPending.length;
  next = removePlayerFromTurnState(next, playerId);
  if (next.phase === PHASES.MOBILIZATION && next.mobilizationTurnsRemaining === 0) next.phase = PHASES.WAR;
  next = resolveVictory(next);
  return { room: next, surrendered: true };
}

export function skipWarTurnState(room) {
  const activeId = getActivePlayerId(room);
  if (room.phase === PHASES.MOBILIZATION) return applyMobilizationReady(room, activeId, { grantIncome: false });
  if (room.phase === PHASES.WAR) return applyWarEndTurn(room, activeId, { grantIncome: false });
  return { room: advanceTurn(room), eligibility: { legal: true, code: 'AVAILABLE' } };
}
