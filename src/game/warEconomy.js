import { calculateIncome, safeMoney } from './economy';
import { PHASES } from './phases';
import {
  PORT_COST,
  SHIP_COST,
  SOLDIER_BATCH,
  SOLDIER_COST,
  isPositiveInteger,
} from './warConstants';
import { NAVAL_POLICIES, isFinalCoastalLand, normalizeNavalConfig } from './navalPolicy';

export function isWarTurnPhase(phase) {
  return phase === PHASES.MOBILIZATION || phase === PHASES.WAR;
}

export function canBuildPort(region, mapDefinition) {
  const policy = normalizeNavalConfig(mapDefinition, {
    mapDefinition,
    defaultPolicy: NAVAL_POLICIES.SELECTED_ROUTES,
  }).navalPolicy;
  return policy !== NAVAL_POLICIES.DISABLED
    && isFinalCoastalLand(region)
    && (region.portAllowed === undefined || region.portAllowed === true);
}

export function grantTurnIncome(room, playerId = room?.turnOrder?.[room?.turnIndex]) {
  const player = room?.players?.[playerId];
  if (!isWarTurnPhase(room?.phase) || !player || player.eliminated || playerId !== room.turnOrder?.[room.turnIndex]) {
    return { room, granted: 0, due: false };
  }
  if ((player.lastIncomeTurn || 0) >= room.turnNumber) return { room, granted: 0, due: false };
  const income = calculateIncome(room.mapDefinition, room.claims, playerId);
  return {
    granted: income,
    due: true,
    room: {
      ...room,
      players: {
        ...room.players,
        [playerId]: {
          ...player,
          money: safeMoney(player.money) + income,
          income,
          lastIncomeTurn: room.turnNumber,
        },
      },
    },
  };
}

function logisticsBase(room, playerId, regionId) {
  if (!isWarTurnPhase(room?.phase)) return { legal: false, code: 'WRONG_PHASE', reason: 'Lojistik yalnızca seferberlik veya savaş sırasında yapılabilir.' };
  if (room.turnOrder?.[room.turnIndex] !== playerId) return { legal: false, code: 'NOT_ACTIVE', reason: 'Sıra sende değil.' };
  const player = room.players?.[playerId];
  if (!player || player.eliminated) return { legal: false, code: 'ELIMINATED', reason: 'Elendiğin için emir veremezsin.' };
  const claim = room.claims?.[regionId];
  if (!claim || claim.ownerId !== playerId) return { legal: false, code: 'NOT_OWNED', reason: 'Bu bölge senin yönetiminde değil.' };
  const region = room.mapDefinition?.regionsById?.[regionId];
  if (!region) return { legal: false, code: 'UNKNOWN_REGION', reason: 'Bölge harita tanımında bulunmuyor.' };
  return { legal: true, player, claim, region };
}

function purchase(room, playerId, regionId, kind, count) {
  const paid = grantTurnIncome(room, playerId).room;
  const base = logisticsBase(paid, playerId, regionId);
  if (!base.legal) return { room, eligibility: base };
  if (!isPositiveInteger(count)) return { room, eligibility: { legal: false, code: 'INVALID_COUNT', reason: 'Adet pozitif bir tam sayı olmalı.' } };
  const costs = { soldiers: SOLDIER_COST, port: PORT_COST, ships: SHIP_COST };
  const cost = costs[kind] * count;
  if (!Number.isSafeInteger(cost) || safeMoney(base.player.money) < cost) {
    return { room, eligibility: { legal: false, code: 'INSUFFICIENT_FUNDS', reason: 'Hazinede yeterli altın yok.' } };
  }
  const policy = normalizeNavalConfig(paid.mapDefinition, {
    mapDefinition: paid.mapDefinition,
    defaultPolicy: NAVAL_POLICIES.SELECTED_ROUTES,
  }).navalPolicy;
  if ((kind === 'port' || kind === 'ships') && policy === NAVAL_POLICIES.DISABLED) {
    return { room, eligibility: { legal: false, code: 'NAVAL_DISABLED', reason: 'Deniz politikası kapalı.' } };
  }
  if (kind === 'port' && (!canBuildPort(base.region, paid.mapDefinition) || base.claim.hasPort)) {
    const code = base.claim.hasPort
      ? 'HAS_PORT'
      : isFinalCoastalLand(base.region)
        ? 'PORT_NOT_ALLOWED'
        : 'NOT_COASTAL';
    const reason = base.claim.hasPort
      ? 'Bu bölgede zaten liman var.'
      : isFinalCoastalLand(base.region)
        ? 'Bu kıyı bölgesinde liman kurulmasına harita hazırlığında izin verilmemiş.'
        : 'Liman yalnızca kıyı bölgesine kurulabilir.';
    return { room, eligibility: { legal: false, code, reason } };
  }
  if (kind === 'ships' && (!isFinalCoastalLand(base.region) || base.region.portAllowed === false || !base.claim.hasPort)) {
    return { room, eligibility: { legal: false, code: 'PORT_REQUIRED', reason: 'Gemi satın almak için kıyı bölgesinde liman gerekir.' } };
  }
  const claim = {
    ...base.claim,
    ...(kind === 'soldiers' ? { soldiers: base.claim.soldiers + SOLDIER_BATCH * count } : {}),
    ...(kind === 'port' ? { hasPort: true } : {}),
    ...(kind === 'ships' ? { ships: base.claim.ships + count } : {}),
  };
  return {
    eligibility: { legal: true, code: 'AVAILABLE', cost, incomeGranted: paid.players[playerId].money - safeMoney(room.players[playerId].money) },
    room: {
      ...paid,
      players: { ...paid.players, [playerId]: { ...paid.players[playerId], money: paid.players[playerId].money - cost } },
      claims: { ...paid.claims, [regionId]: claim },
    },
  };
}

export const applyRecruitSoldiers = (room, playerId, regionId, batches) => purchase(room, playerId, regionId, 'soldiers', batches);
export const applyBuildPort = (room, playerId, regionId) => purchase(room, playerId, regionId, 'port', 1);
export const applyBuyShips = (room, playerId, regionId, count) => purchase(room, playerId, regionId, 'ships', count);
