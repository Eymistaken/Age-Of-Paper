import { getLandAttackEligibility, getNavalAttackEligibility } from './warCombat';
import { getLandTransferEligibility, getNavalTransferEligibility } from './warMovement';
import { SOLDIER_BATCH } from './warConstants';

export const WAR_INTERACTION_MODES = Object.freeze({
  IDLE: 'idle',
  SELECTING_MOVE_SOURCE: 'selecting_move_source',
  SELECTING_MOVE_TARGET: 'selecting_move_target',
  SELECTING_ATTACK_SOURCE: 'selecting_attack_source',
  SELECTING_ATTACK_TARGET: 'selecting_attack_target',
});

export function createWarPlan() {
  return { mode: WAR_INTERACTION_MODES.IDLE, operation: null, routeType: 'land', sourceId: null, targetId: null, amount: SOLDIER_BATCH };
}

export function startWarPlan(operation, routeType) {
  return {
    ...createWarPlan(),
    operation,
    routeType,
    mode: operation === 'attack' ? WAR_INTERACTION_MODES.SELECTING_ATTACK_SOURCE : WAR_INTERACTION_MODES.SELECTING_MOVE_SOURCE,
  };
}

export function getWarPlanEligibility(room, playerId, plan, targetId = plan.targetId) {
  if (!plan.sourceId || !targetId) return { legal: false, code: 'INCOMPLETE', reason: plan.sourceId ? 'Hedef bölgeyi seç.' : 'Kaynak bölgeyi seç.' };
  if (plan.operation === 'attack') {
    return plan.routeType === 'naval'
      ? getNavalAttackEligibility(room, playerId, plan.sourceId, targetId, plan.amount)
      : getLandAttackEligibility(room, playerId, plan.sourceId, targetId, plan.amount);
  }
  return plan.routeType === 'naval'
    ? getNavalTransferEligibility(room, playerId, plan.sourceId, targetId, plan.amount)
    : getLandTransferEligibility(room, playerId, plan.sourceId, targetId, plan.amount);
}

export function getWarHighlights(room, playerId, plan) {
  const ids = room.mapDefinition?.regionIds || [];
  const selectingSource = [WAR_INTERACTION_MODES.SELECTING_MOVE_SOURCE, WAR_INTERACTION_MODES.SELECTING_ATTACK_SOURCE].includes(plan.mode);
  const sources = selectingSource ? ids.filter((id) => {
    const claim = room.claims?.[id];
    const region = room.mapDefinition?.regionsById?.[id];
    return claim?.ownerId === playerId
      && (claim.soldiers || 0) >= SOLDIER_BATCH
      && (plan.routeType !== 'naval' || (region?.coastal && claim.hasPort && claim.ships > 0));
  }) : plan.sourceId ? [plan.sourceId] : [];
  const targets = plan.sourceId ? ids.filter((id) => getWarPlanEligibility(room, playerId, plan, id).legal) : [];
  return { sources, targets };
}

export function selectWarRegion(room, playerId, plan, regionId) {
  const highlights = getWarHighlights(room, playerId, plan);
  if ([WAR_INTERACTION_MODES.SELECTING_MOVE_SOURCE, WAR_INTERACTION_MODES.SELECTING_ATTACK_SOURCE].includes(plan.mode)) {
    if (!highlights.sources.includes(regionId)) return plan;
    const sourceSoldiers = room.claims?.[regionId]?.soldiers || SOLDIER_BATCH;
    return {
      ...plan,
      sourceId: regionId,
      targetId: null,
      amount: Math.min(Math.max(SOLDIER_BATCH, plan.amount), sourceSoldiers),
      mode: plan.operation === 'attack' ? WAR_INTERACTION_MODES.SELECTING_ATTACK_TARGET : WAR_INTERACTION_MODES.SELECTING_MOVE_TARGET,
    };
  }
  if ([WAR_INTERACTION_MODES.SELECTING_MOVE_TARGET, WAR_INTERACTION_MODES.SELECTING_ATTACK_TARGET].includes(plan.mode)
    && highlights.targets.includes(regionId)) return { ...plan, targetId: regionId };
  return plan;
}
