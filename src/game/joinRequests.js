import {
  BASE_INCOME,
  COLORS,
  JOIN_REQUEST_TTL,
  MAX_PLAYERS,
  STARTING_MONEY,
} from '../constants';
import { PHASES } from './phases';

export const JOIN_REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});

export function valueMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return 0;
}

export function isJoinRequestExpired(request, now = Date.now()) {
  return valueMillis(request?.expiresAt) <= valueMillis(now);
}

export function pickAvailablePlayerColor(players = {}) {
  const used = new Set(Object.values(players).map((player) => player.color));
  return COLORS.find((color) => !used.has(color)) || null;
}

export function createJoinRequestRecord(room, userId, name, createdAt, expiresAt) {
  return {
    uid: userId,
    name: String(name || '').trim().slice(0, 32),
    createdAt,
    expiresAt: expiresAt ?? valueMillis(createdAt) + JOIN_REQUEST_TTL,
    updatedAt: createdAt,
    status: JOIN_REQUEST_STATUS.PENDING,
    requiredVoterIds: Object.keys(room.players || {}).filter((id) => id !== room.hostId && id !== userId),
    approvals: {},
    rejections: {},
    decisionAt: null,
    decidedBy: null,
  };
}

export function getEffectiveVoterIds(room, request) {
  const players = room?.players || {};
  return [...new Set(request?.requiredVoterIds || [])]
    .filter((id) => id !== room?.hostId && id !== request?.uid && Boolean(players[id]));
}

export function getJoinVoteSummary(room, request) {
  const voterIds = getEffectiveVoterIds(room, request);
  const approvals = voterIds.filter((id) => request?.approvals?.[id] === true);
  const rejections = voterIds.filter((id) => request?.rejections?.[id] === true);
  return {
    voterIds,
    approvals,
    rejections,
    approvedCount: approvals.length,
    requiredCount: voterIds.length,
    unanimous: voterIds.length > 0 && approvals.length === voterIds.length && rejections.length === 0,
  };
}

export function mayAcceptJoinRequest(room, request, actorId, now = Date.now()) {
  if (!room || room.phase !== PHASES.CLAIMING) return false;
  if (!request || request.status !== JOIN_REQUEST_STATUS.PENDING || isJoinRequestExpired(request, now)) return false;
  if (room.players?.[request.uid] || !room.players?.[actorId]) return false;
  if (Object.keys(room.players).length >= MAX_PLAYERS || !pickAvailablePlayerColor(room.players)) return false;
  const hasNeutralRegion = room.mapDefinition?.regionIds?.some((id) => !room.claims?.[id]?.ownerId);
  if (!hasNeutralRegion) return false;
  return actorId === room.hostId || getJoinVoteSummary(room, request).unanimous;
}

export function castJoinVote(room, requesterId, voterId, vote, updatedAt) {
  const request = room.joinRequests?.[requesterId];
  if (!request || request.status !== JOIN_REQUEST_STATUS.PENDING) throw new Error('Katılma isteği artık beklemede değil.');
  if (!getEffectiveVoterIds(room, request).includes(voterId)) throw new Error('Bu istek için oy kullanamazsın.');
  if (!['approve', 'reject'].includes(vote)) throw new Error('Geçersiz katılma oyu.');
  const approvals = { ...(request.approvals || {}) };
  const rejections = { ...(request.rejections || {}) };
  if (vote === 'approve') {
    approvals[voterId] = true;
    delete rejections[voterId];
  } else {
    rejections[voterId] = true;
    delete approvals[voterId];
  }
  return {
    ...room,
    joinRequests: {
      ...(room.joinRequests || {}),
      [requesterId]: { ...request, approvals, rejections, updatedAt },
    },
  };
}

export function acceptJoinRequestState(room, requesterId, actorId, now, makePlayer) {
  const request = room.joinRequests?.[requesterId];
  if (!mayAcceptJoinRequest(room, request, actorId, now)) throw new Error('Katılma isteği kabul koşullarını karşılamıyor.');
  const color = pickAvailablePlayerColor(room.players);
  const player = makePlayer
    ? makePlayer(request, color)
    : {
      id: request.uid,
      name: request.name,
      color,
      money: STARTING_MONEY,
      income: BASE_INCOME,
      regionIds: [],
      joinedAt: now,
      lastActive: now,
      lastIncomeTurn: 0,
    };
  return {
    ...room,
    players: { ...room.players, [request.uid]: player },
    turnOrder: [...room.turnOrder, request.uid],
    joinRequests: {
      ...room.joinRequests,
      [requesterId]: {
        ...request,
        status: JOIN_REQUEST_STATUS.ACCEPTED,
        updatedAt: now,
        decisionAt: now,
        decidedBy: actorId,
      },
    },
  };
}
