import {
  FieldPath,
  Timestamp,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  BASE_INCOME,
  CHAT_HISTORY_LIMIT,
  CHAT_MESSAGE_LIMIT,
  COLORS,
  JOIN_REQUEST_TTL,
  MAX_JOIN_REQUESTS,
  MAX_PLAYERS,
  OFFLINE_SKIP_TIMEOUT,
  ROOM_CODE_LENGTH,
  STARTING_MONEY,
} from '../constants';
import { PHASES } from '../game/phases';
import { applyClaim, applySaveIncome, releasePlayerClaims } from '../game/rules';
import { advanceTurn, getActivePlayerId, removePlayerFromTurnState } from '../game/turns';
import { validateMapDefinition } from '../game/mapValidation';
import { setNavalRoute, setRegionCoastal } from '../game/navalRoutes';
import {
  applyBuildPort,
  applyBuyShips,
  applyRecruitSoldiers,
  grantTurnIncome,
} from '../game/warEconomy';
import {
  applyMobilizationReady,
  applyWarAttack,
  applyWarEndTurn,
  applyWarTransfer,
  skipWarTurnState,
  startMobilizationState,
  surrenderPlayerState,
} from '../game/warState';
import { WAR_SCHEMA_VERSION } from '../game/warConstants';
import {
  JOIN_REQUEST_STATUS,
  acceptJoinRequestState,
  castJoinVote,
  createJoinRequestRecord,
  getJoinVoteSummary,
  isJoinRequestExpired,
  pickAvailablePlayerColor,
} from '../game/joinRequests';

const ROOM_COLLECTION = 'rooms';

export class GameActionError extends Error {
  constructor(message, code = 'GAME_ACTION_FAILED') {
    super(message);
    this.name = 'GameActionError';
    this.code = code;
  }
}

function roomRef(roomCode) {
  return doc(db, ROOM_COLLECTION, roomCode);
}

export function cleanNickname(nickname) {
  return String(nickname || '').trim().slice(0, 32);
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return value;
  return 0;
}

function makePlayer(userId, nickname, color, joinedAt = Timestamp.now()) {
  return {
    id: userId,
    name: cleanNickname(nickname),
    color,
    money: STARTING_MONEY,
    income: BASE_INCOME,
    regionIds: [],
    joinedAt,
    lastActive: Timestamp.now(),
    lastIncomeTurn: 0,
    eliminated: false,
  };
}

function joinRequestAction(type, actorId, requesterId) {
  return { type, actorId, requesterId, at: Timestamp.now() };
}

function assertRequestCanStart(room, userId) {
  if (room.phase !== PHASES.CLAIMING) {
    throw new GameActionError('Toprak edinme tamamlandığı için yeni katılma isteği alınmıyor.', 'JOIN_REQUEST_CLOSED');
  }
  if (Object.keys(room.players || {}).length >= MAX_PLAYERS) throw new GameActionError('Oda dolu.', 'ROOM_FULL');
  if (!room.mapDefinition?.regionIds?.some((id) => !room.claims?.[id]?.ownerId)) {
    throw new GameActionError('Alınabilecek tarafsız bölge kalmadı.', 'NO_NEUTRAL_REGION');
  }
  const ownRequest = room.joinRequests?.[userId];
  if (ownRequest?.status === JOIN_REQUEST_STATUS.PENDING && !isJoinRequestExpired(ownRequest)) return ownRequest;
  if (!(userId in (room.joinRequests || {})) && Object.keys(room.joinRequests || {}).length >= MAX_JOIN_REQUESTS) {
    throw new GameActionError('Bu oda çok fazla eski katılma kaydı içeriyor.', 'JOIN_REQUEST_LIMIT');
  }
  return null;
}

function randomRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join('');
}

function shuffled(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function oldestPlayerId(players) {
  return Object.values(players).sort((a, b) => {
    const difference = timestampMillis(a.joinedAt) - timestampMillis(b.joinedAt);
    return difference || String(a.id).localeCompare(String(b.id));
  })[0]?.id;
}

export async function createRoom(userId, nickname) {
  if (!cleanNickname(nickname)) throw new GameActionError('Lütfen bir komutan adı girin.', 'INVALID_NAME');

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomRoomCode();
    try {
      await runTransaction(db, async (transaction) => {
        const reference = roomRef(code);
        const snapshot = await transaction.get(reference);
        if (snapshot.exists()) throw new GameActionError('Oda kodu çakıştı.', 'ROOM_COLLISION');
        transaction.set(reference, {
          schemaVersion: WAR_SCHEMA_VERSION,
          phase: PHASES.LOBBY,
          hostId: userId,
          createdAt: serverTimestamp(),
          mapSvg: '',
          mapDefinition: null,
          mapValidation: { valid: false, errors: [], warnings: [], regionCount: 0 },
          players: { [userId]: makePlayer(userId, nickname, COLORS[0]) },
          turnOrder: [],
          turnIndex: 0,
          turnNumber: 0,
          roundNumber: 0,
          claims: {},
          chat: [],
          lastAction: null,
          joinRequests: {},
          joinRequestAction: null,
          mobilizationTurnsRemaining: 0,
          mobilizationPending: [],
          winnerId: null,
          completedAt: null,
        });
      });
      return code;
    } catch (error) {
      if (error?.code !== 'ROOM_COLLISION') throw error;
    }
  }
  throw new GameActionError('Benzersiz oda kodu üretilemedi. Lütfen tekrar deneyin.', 'ROOM_CODE_EXHAUSTED');
}

export async function joinRoom(roomCode, userId, nickname) {
  const code = String(roomCode || '').trim().toUpperCase();
  if (!cleanNickname(nickname) || !code) throw new GameActionError('Komutan adı ve oda kodu gerekli.', 'INVALID_JOIN');

  return runTransaction(db, async (transaction) => {
    const reference = roomRef(code);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    if (room.players?.[userId]) return { code, mode: 'joined' };
    const players = room.players || {};
    if (room.phase === PHASES.LOBBY) {
      if (Object.keys(players).length >= MAX_PLAYERS) throw new GameActionError('Oda dolu.', 'ROOM_FULL');
      const color = pickAvailablePlayerColor(players);
      if (!color) throw new GameActionError('Kullanılabilir komutan rengi kalmadı.', 'NO_PLAYER_COLOR');
      transaction.update(reference, {
        players: { ...players, [userId]: makePlayer(userId, nickname, color) },
      });
      return { code, mode: 'joined' };
    }

    const existingRequest = assertRequestCanStart(room, userId);
    if (existingRequest) return { code, mode: 'requested', request: existingRequest };
    const createdAt = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(createdAt.toMillis() + JOIN_REQUEST_TTL);
    const request = createJoinRequestRecord(room, userId, cleanNickname(nickname), createdAt, expiresAt);
    transaction.update(reference, {
      joinRequests: { ...(room.joinRequests || {}), [userId]: request },
      joinRequestAction: joinRequestAction('create', userId, userId),
    });
    return { code, mode: 'requested', request };
  });
}

export async function voteJoinRequest(roomCode, voterId, requesterId, vote) {
  const result = await runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    const request = room.joinRequests?.[requesterId];
    if (isJoinRequestExpired(request)) throw new GameActionError('Katılma isteğinin süresi doldu.', 'REQUEST_EXPIRED');
    let next;
    try {
      next = castJoinVote(room, requesterId, voterId, vote, Timestamp.now());
    } catch (error) {
      throw new GameActionError(error.message, 'INVALID_JOIN_VOTE');
    }
    transaction.update(reference, {
      joinRequests: next.joinRequests,
      joinRequestAction: joinRequestAction(vote, voterId, requesterId),
    });
    return getJoinVoteSummary(next, next.joinRequests[requesterId]).unanimous;
  });
  if (result && vote === 'approve') {
    try {
      await acceptJoinRequest(roomCode, voterId, requesterId);
    } catch (error) {
      if (!['JOIN_CONDITIONS', 'REQUEST_NOT_PENDING'].includes(error?.code)) throw error;
    }
  }
  return result;
}

export async function acceptJoinRequest(roomCode, actorId, requesterId) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    const request = room.joinRequests?.[requesterId];
    if (!request || request.status !== JOIN_REQUEST_STATUS.PENDING) {
      throw new GameActionError('Katılma isteği artık beklemede değil.', 'REQUEST_NOT_PENDING');
    }
    let next;
    const now = Timestamp.now();
    try {
      next = acceptJoinRequestState(room, requesterId, actorId, now, (pending, color) => (
        makePlayer(pending.uid, pending.name, color, now)
      ));
    } catch (error) {
      throw new GameActionError(error.message, 'JOIN_CONDITIONS');
    }
    transaction.update(reference, {
      players: next.players,
      turnOrder: next.turnOrder,
      joinRequests: next.joinRequests,
      joinRequestAction: joinRequestAction('accept', actorId, requesterId),
    });
    return true;
  });
}

export async function rejectJoinRequest(roomCode, hostId, requesterId) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    const request = room.joinRequests?.[requesterId];
    if (room.hostId !== hostId) throw new GameActionError('İsteği yalnızca güncel kurucu kapatabilir.', 'HOST_ONLY');
    if (!request || request.status !== JOIN_REQUEST_STATUS.PENDING) throw new GameActionError('İstek artık beklemede değil.', 'REQUEST_NOT_PENDING');
    const now = Timestamp.now();
    transaction.update(reference, {
      joinRequests: {
        ...room.joinRequests,
        [requesterId]: { ...request, status: JOIN_REQUEST_STATUS.REJECTED, updatedAt: now, decisionAt: now, decidedBy: hostId },
      },
      joinRequestAction: joinRequestAction('reject_request', hostId, requesterId),
    });
  });
}

export async function cancelJoinRequest(roomCode, requesterId) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return false;
    const room = snapshot.data();
    const request = room.joinRequests?.[requesterId];
    if (!request || request.status !== JOIN_REQUEST_STATUS.PENDING) {
      throw new GameActionError('İstek artık iptal edilemez.', 'REQUEST_NOT_PENDING');
    }
    const now = Timestamp.now();
    transaction.update(reference, {
      joinRequests: {
        ...room.joinRequests,
        [requesterId]: { ...request, status: JOIN_REQUEST_STATUS.CANCELLED, updatedAt: now, decisionAt: now, decidedBy: requesterId },
      },
      joinRequestAction: joinRequestAction('cancel', requesterId, requesterId),
    });
    return true;
  });
}

export async function expireJoinRequest(roomCode, actorId, requesterId) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return false;
    const room = snapshot.data();
    const request = room.joinRequests?.[requesterId];
    if (!request || request.status !== JOIN_REQUEST_STATUS.PENDING) return false;
    if (actorId !== requesterId && !room.players?.[actorId]) throw new GameActionError('Bu isteği sona erdiremezsin.', 'NOT_PLAYER');
    if (!isJoinRequestExpired(request)) throw new GameActionError('İstek henüz sona ermedi.', 'REQUEST_ACTIVE');
    const now = Timestamp.now();
    transaction.update(reference, {
      joinRequests: {
        ...room.joinRequests,
        [requesterId]: { ...request, status: JOIN_REQUEST_STATUS.EXPIRED, updatedAt: now, decisionAt: now, decidedBy: actorId },
      },
      joinRequestAction: joinRequestAction('expire', actorId, requesterId),
    });
    return true;
  });
}

export async function clearClosedJoinRequest(roomCode, actorId, requesterId) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return false;
    const room = snapshot.data();
    const request = room.joinRequests?.[requesterId];
    if (!request || request.status === JOIN_REQUEST_STATUS.PENDING) return false;
    if (actorId !== requesterId && room.hostId !== actorId) throw new GameActionError('Bu isteği temizleyemezsin.', 'HOST_ONLY');
    const joinRequests = { ...room.joinRequests };
    delete joinRequests[requesterId];
    transaction.update(reference, {
      joinRequests,
      joinRequestAction: joinRequestAction('clear', actorId, requesterId),
    });
    return true;
  });
}

export async function leaveRoom(roomCode, userId) {
  await runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return;
    const room = snapshot.data();
    if (!room.players?.[userId]) return;
    const players = { ...room.players };
    delete players[userId];
    if (Object.keys(players).length === 0) {
      transaction.delete(reference);
      return;
    }

    const isSurrender = [PHASES.CLAIM_COMPLETE, PHASES.MOBILIZATION, PHASES.WAR].includes(room.phase);
    const surrender = isSurrender ? surrenderPlayerState(room, userId) : null;
    const turnState = surrender?.room || removePlayerFromTurnState(room, userId);
    const claims = isSurrender
      ? surrender.room.claims
      : room.phase === PHASES.CLAIMING
        ? releasePlayerClaims(room.claims, userId)
        : room.claims;
    const now = Timestamp.now();
    transaction.update(reference, {
      players: surrender?.room.players || players,
      claims,
      hostId: room.hostId === userId ? oldestPlayerId(players) : room.hostId,
      turnOrder: turnState.turnOrder,
      turnIndex: turnState.turnIndex || 0,
      turnNumber: turnState.turnNumber || room.turnNumber || 0,
      roundNumber: turnState.roundNumber || room.roundNumber || 0,
      phase: turnState.phase || room.phase,
      mobilizationTurnsRemaining: turnState.mobilizationTurnsRemaining || 0,
      mobilizationPending: turnState.mobilizationPending || [],
      winnerId: turnState.winnerId || null,
      completedAt: turnState.phase === PHASES.FINISHED ? now : (room.completedAt || null),
      lastAction: {
        type: isSurrender ? 'surrender' : 'leave',
        actorId: userId,
        turnNumber: turnState.turnNumber || room.turnNumber || 0,
        winnerId: turnState.winnerId || null,
        actionId: actionId(room.turnNumber || 0, isSurrender ? 'surrender' : 'leave', userId),
        at: now,
      },
    });
  });
}

export async function setRoomMap(roomCode, userId, importedMap) {
  await runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    if (room.hostId !== userId) throw new GameActionError('Haritayı yalnızca kurucu değiştirebilir.', 'HOST_ONLY');
    if (room.phase !== PHASES.LOBBY) throw new GameActionError('Oyun başladıktan sonra harita değiştirilemez.', 'ROOM_STARTED');
    transaction.update(reference, {
      mapSvg: importedMap.sanitizedSvg,
      mapDefinition: importedMap.mapDefinition,
      mapValidation: importedMap.validation,
    });
  });
}

export async function configureNavalMap(roomCode, userId, edit) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    if (room.hostId !== userId) throw new GameActionError('Deniz rotalarını yalnızca kurucu düzenleyebilir.', 'HOST_ONLY');
    if (room.phase !== PHASES.LOBBY) throw new GameActionError('Oyun başladıktan sonra deniz rotaları değiştirilemez.', 'ROOM_STARTED');
    if (!room.mapDefinition) throw new GameActionError('Önce geçerli bir harita yükle.', 'INVALID_MAP');
    const result = edit.type === 'coastal'
      ? setRegionCoastal(room.mapDefinition, edit.regionId, edit.coastal, { removeRoutes: edit.removeRoutes === true })
      : setNavalRoute(room.mapDefinition, edit.firstId, edit.secondId, edit.connected !== false);
    if (!result.ok) throw new GameActionError(result.reason, result.code);
    const validation = validateMapDefinition(result.mapDefinition);
    transaction.update(reference, {
      mapDefinition: result.mapDefinition,
      mapValidation: validation,
      lastAction: {
        type: 'naval_config',
        actorId: userId,
        editType: edit.type,
        regionId: edit.regionId || null,
        firstId: edit.firstId || null,
        secondId: edit.secondId || null,
        connected: edit.connected !== false,
        actionId: `naval_config:${userId}:${Date.now()}`,
        at: Timestamp.now(),
      },
    });
    return result;
  });
}

export async function startGame(roomCode, userId) {
  await runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    if (room.hostId !== userId) throw new GameActionError('Oyunu yalnızca kurucu başlatabilir.', 'HOST_ONLY');
    if (room.phase !== PHASES.LOBBY) throw new GameActionError('Oyun zaten başlatılmış.', 'ROOM_STARTED');
    const validation = validateMapDefinition(room.mapDefinition);
    if (!validation.valid || !room.mapSvg) throw new GameActionError('Geçerli bir harita yüklenmeden oyun başlatılamaz.', 'INVALID_MAP');
    const turnOrder = shuffled(Object.keys(room.players || {}));
    if (!turnOrder.length) throw new GameActionError('Oyunu başlatmak için bir oyuncu gerekli.', 'NO_PLAYERS');
    const players = Object.fromEntries(Object.entries(room.players).map(([id, player]) => [id, {
      ...player,
      money: STARTING_MONEY,
      income: BASE_INCOME,
      regionIds: [],
      lastIncomeTurn: 0,
      eliminated: false,
    }]));
    transaction.update(reference, {
      phase: PHASES.CLAIMING,
      players,
      claims: {},
      turnOrder,
      turnIndex: 0,
      turnNumber: 1,
      roundNumber: 1,
      lastAction: { type: 'start', actorId: userId, turnNumber: 1, at: Timestamp.now() },
    });
  });
}

function assertExpectedTurn(room, expectedTurnNumber) {
  if (Number.isInteger(expectedTurnNumber) && room.turnNumber !== expectedTurnNumber) {
    throw new GameActionError('Bu hamlenin turu artık geçmiş.', 'STALE_TURN');
  }
}

function assertExpectedWarTurn(room, expectedTurnNumber) {
  if (!Number.isInteger(expectedTurnNumber) || room.turnNumber !== expectedTurnNumber) {
    throw new GameActionError('Bu emrin turu artık geçmiş.', 'STALE_TURN');
  }
}

function assertWarSchema(room) {
  if (room.schemaVersion !== WAR_SCHEMA_VERSION) {
    throw new GameActionError('Bu oda güncel savaş şemasını kullanmıyor.', 'INCOMPATIBLE_ROOM');
  }
}

function throwIfIllegal(result) {
  if (!result?.eligibility?.legal) {
    throw new GameActionError(result?.eligibility?.reason || 'Emir uygulanamadı.', result?.eligibility?.code);
  }
}

function campaignFields(next, action, now = Timestamp.now()) {
  return {
    phase: next.phase,
    players: next.players,
    claims: next.claims,
    turnOrder: next.turnOrder,
    turnIndex: next.turnIndex,
    turnNumber: next.turnNumber,
    roundNumber: next.roundNumber,
    mobilizationTurnsRemaining: next.mobilizationTurnsRemaining || 0,
    mobilizationPending: next.mobilizationPending || [],
    winnerId: next.winnerId || null,
    completedAt: next.phase === PHASES.FINISHED ? (next.completedAt || now) : null,
    lastAction: { ...action, at: now },
  };
}

export async function startMobilization(roomCode, userId) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    assertWarSchema(room);
    const result = startMobilizationState(room, userId);
    throwIfIllegal(result);
    const next = result.room;
    const now = Timestamp.now();
    transaction.update(reference, campaignFields(next, {
      type: 'mobilization_start',
      actorId: userId,
      turnNumber: next.turnNumber,
      actionId: actionId(next.turnNumber, 'mobilization_start', userId),
    }, now));
    return true;
  });
}

export async function grantCurrentTurnIncome(roomCode, userId, expectedTurnNumber) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    assertWarSchema(room);
    assertExpectedWarTurn(room, expectedTurnNumber);
    if (getActivePlayerId(room) !== userId) throw new GameActionError('Sıra sende değil.', 'NOT_ACTIVE');
    const result = grantTurnIncome(room, userId);
    if (!result.due) return 0;
    transaction.update(reference, {
      players: result.room.players,
      lastAction: {
        type: 'turn_income', actorId: userId, amount: result.granted, turnNumber: room.turnNumber,
        actionId: actionId(room.turnNumber, 'turn_income', userId), at: Timestamp.now(),
      },
    });
    return result.granted;
  });
}

async function runLogistics(roomCode, userId, expectedTurnNumber, type, regionId, count) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    assertWarSchema(room);
    assertExpectedWarTurn(room, expectedTurnNumber);
    const result = type === 'recruit_soldiers'
      ? applyRecruitSoldiers(room, userId, regionId, count)
      : type === 'build_port'
        ? applyBuildPort(room, userId, regionId)
        : applyBuyShips(room, userId, regionId, count);
    throwIfIllegal(result);
    transaction.update(reference, {
      players: result.room.players,
      claims: result.room.claims,
      lastAction: {
        type, actorId: userId, regionId, count, cost: result.eligibility.cost,
        turnNumber: room.turnNumber, actionId: actionId(room.turnNumber, type, userId, `${regionId}:${Date.now()}`), at: Timestamp.now(),
      },
    });
    return result.eligibility;
  });
}

export const recruitSoldiers = (roomCode, userId, regionId, batches, expectedTurnNumber) => (
  runLogistics(roomCode, userId, expectedTurnNumber, 'recruit_soldiers', regionId, batches)
);
export const buildPort = (roomCode, userId, regionId, expectedTurnNumber) => (
  runLogistics(roomCode, userId, expectedTurnNumber, 'build_port', regionId, 1)
);
export const buyShips = (roomCode, userId, regionId, count, expectedTurnNumber) => (
  runLogistics(roomCode, userId, expectedTurnNumber, 'buy_ships', regionId, count)
);

export async function finishMobilizationTurn(roomCode, userId, expectedTurnNumber) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    assertWarSchema(room);
    assertExpectedWarTurn(room, expectedTurnNumber);
    const result = applyMobilizationReady(room, userId);
    throwIfIllegal(result);
    const now = Timestamp.now();
    transaction.update(reference, campaignFields(result.room, {
      type: 'mobilization_ready', actorId: userId, turnNumber: room.turnNumber,
      actionId: actionId(room.turnNumber, 'mobilization_ready', userId),
    }, now));
    return result.room.phase;
  });
}

async function runOperation(roomCode, userId, expectedTurnNumber, operation) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    assertWarSchema(room);
    assertExpectedWarTurn(room, expectedTurnNumber);
    let result;
    if (operation.kind === 'end') result = applyWarEndTurn(room, userId);
    else if (operation.kind === 'transfer') result = applyWarTransfer(room, userId, operation.sourceId, operation.targetId, operation.amount, operation.routeType);
    else result = applyWarAttack(room, userId, operation.sourceId, operation.targetId, operation.amount, operation.routeType);
    throwIfIllegal(result);
    const type = operation.kind === 'end' ? 'end_war_turn' : `${operation.routeType}_${operation.kind}`;
    const now = Timestamp.now();
    const attack = result.eligibility.result;
    transaction.update(reference, campaignFields(result.room, {
      type,
      actorId: userId,
      sourceId: operation.sourceId || null,
      targetId: operation.targetId || null,
      amount: operation.amount || 0,
      previousOwnerId: result.eligibility.previousOwnerId || null,
      success: attack?.captured ?? null,
      path: result.eligibility.path || null,
      winnerId: result.room.winnerId || null,
      turnNumber: room.turnNumber,
      actionId: actionId(room.turnNumber, type, userId, operation.targetId || ''),
    }, now));
    return result.eligibility;
  });
}

export const transferTroops = (roomCode, userId, routeType, sourceId, targetId, amount, expectedTurnNumber) => (
  runOperation(roomCode, userId, expectedTurnNumber, { kind: 'transfer', routeType, sourceId, targetId, amount })
);
export const attackRegion = (roomCode, userId, routeType, sourceId, targetId, amount, expectedTurnNumber) => (
  runOperation(roomCode, userId, expectedTurnNumber, { kind: 'attack', routeType, sourceId, targetId, amount })
);
export const endWarTurn = (roomCode, userId, expectedTurnNumber) => (
  runOperation(roomCode, userId, expectedTurnNumber, { kind: 'end' })
);

function actionId(turnNumber, type, actorId, detail = '') {
  return [turnNumber, type, actorId, detail].filter(Boolean).join(':');
}

export async function claimRegion(roomCode, userId, regionId, expectedTurnNumber) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    assertExpectedTurn(room, expectedTurnNumber);
    const result = applyClaim(room, userId, regionId);
    if (!result.eligibility.legal) throw new GameActionError(result.eligibility.reason, result.eligibility.code);
    const next = result.room;
    transaction.update(reference, {
      phase: next.phase,
      claims: next.claims,
      players: next.players,
      turnOrder: next.turnOrder,
      turnIndex: next.turnIndex,
      turnNumber: next.turnNumber,
      roundNumber: next.roundNumber,
      lastAction: {
        type: 'claim',
        actorId: userId,
        regionId,
        turnNumber: room.turnNumber,
        actionId: actionId(room.turnNumber, 'claim', userId, regionId),
        at: Timestamp.now(),
      },
    });
    return next.phase;
  });
}

export async function saveIncome(roomCode, userId, expectedTurnNumber) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    assertExpectedTurn(room, expectedTurnNumber);
    const result = applySaveIncome(room, userId);
    if (!result.eligibility.legal) {
      throw new GameActionError(result.eligibility.reason, result.eligibility.code);
    }
    const next = result.room;
    transaction.update(reference, {
      players: next.players,
      turnIndex: next.turnIndex,
      turnNumber: next.turnNumber,
      roundNumber: next.roundNumber,
      lastAction: {
        type: 'save_income',
        actorId: userId,
        turnNumber: room.turnNumber,
        actionId: actionId(room.turnNumber, 'save_income', userId),
        at: Timestamp.now(),
      },
    });
    return result.eligibility.income;
  });
}

export async function skipOfflineTurn(roomCode, hostId, now = Date.now()) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    if (![PHASES.CLAIMING, PHASES.MOBILIZATION, PHASES.WAR].includes(room.phase)) throw new GameActionError('Bu evrede sıra atlanamaz.', 'PHASE_FROZEN');
    if (room.hostId !== hostId) throw new GameActionError('Sırayı yalnızca kurucu atlayabilir.', 'HOST_ONLY');
    const activeId = getActivePlayerId(room);
    const lastActive = timestampMillis(room.players?.[activeId]?.lastActive);
    if (!lastActive || now - lastActive < OFFLINE_SKIP_TIMEOUT) {
      throw new GameActionError('Oyuncu henüz sıra atlama süresini doldurmadı.', 'SKIP_TOO_EARLY');
    }
    if (room.phase !== PHASES.CLAIMING) assertWarSchema(room);
    const result = room.phase === PHASES.CLAIMING
      ? { room: advanceTurn(room), eligibility: { legal: true } }
      : skipWarTurnState(room);
    const next = result.room;
    const nowTimestamp = Timestamp.now();
    transaction.update(reference, campaignFields(next, {
      type: 'skip_offline', actorId: hostId, targetId: activeId, skippedPhase: room.phase,
      turnNumber: room.turnNumber, actionId: actionId(room.turnNumber, 'skip_offline', hostId, activeId),
    }, nowTimestamp));
    return true;
  });
}

export async function updatePresence(roomCode, userId) {
  await updateDoc(roomRef(roomCode), new FieldPath('players', userId, 'lastActive'), serverTimestamp());
}

export async function sendChatMessage(roomCode, userId, text) {
  const messageText = String(text || '').trim().slice(0, CHAT_MESSAGE_LIMIT);
  if (!messageText) return false;
  await runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    const player = room.players?.[userId];
    if (!player) throw new GameActionError('Odanın oyuncusu değilsin.', 'NOT_PLAYER');
    const nonce = crypto.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
    const id = `${userId}_${Date.now()}_${nonce}`;
    const message = {
      id,
      senderId: userId,
      senderName: player.name,
      senderColor: player.color,
      text: messageText,
      createdAt: Date.now(),
    };
    transaction.update(reference, {
      chat: [...(room.chat || []), message].slice(-CHAT_HISTORY_LIMIT),
    });
  });
  return true;
}
