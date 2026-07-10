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
  MAX_PLAYERS,
  OFFLINE_SKIP_TIMEOUT,
  ROOM_CODE_LENGTH,
  STARTING_MONEY,
} from '../constants';
import { grantIncomeForTurn } from '../game/economy';
import { PHASES } from '../game/phases';
import { applyClaim, releasePlayerClaims } from '../game/rules';
import { advanceTurn, getActivePlayerId, removePlayerFromTurnState } from '../game/turns';
import { validateMapDefinition } from '../game/mapValidation';

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

function cleanNickname(nickname) {
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
  };
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
          schemaVersion: 2,
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

  await runTransaction(db, async (transaction) => {
    const reference = roomRef(code);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    if (room.phase !== PHASES.LOBBY) throw new GameActionError('Oyun başladıktan sonra odaya katılınamaz.', 'ROOM_STARTED');
    if (room.players?.[userId]) return;
    const players = room.players || {};
    if (Object.keys(players).length >= MAX_PLAYERS) throw new GameActionError('Oda dolu.', 'ROOM_FULL');
    const usedColors = new Set(Object.values(players).map((player) => player.color));
    const color = COLORS.find((candidate) => !usedColors.has(candidate)) || COLORS[Object.keys(players).length % COLORS.length];
    transaction.update(reference, {
      players: { ...players, [userId]: makePlayer(userId, nickname, color) },
    });
  });
  return code;
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

    const turnState = removePlayerFromTurnState(room, userId);
    const claims = room.phase === PHASES.CLAIMING
      ? releasePlayerClaims(room.claims, userId)
      : room.claims;
    transaction.update(reference, {
      players,
      claims,
      hostId: room.hostId === userId ? oldestPlayerId(players) : room.hostId,
      turnOrder: turnState.turnOrder,
      turnIndex: turnState.turnIndex || 0,
      turnNumber: turnState.turnNumber || room.turnNumber || 0,
      roundNumber: turnState.roundNumber || room.roundNumber || 0,
      lastAction: {
        type: 'leave',
        actorId: userId,
        turnNumber: turnState.turnNumber || room.turnNumber || 0,
        at: Timestamp.now(),
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
    }]));
    players[turnOrder[0]] = grantIncomeForTurn(players[turnOrder[0]], 1);
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

export async function ensureTurnIncome(roomCode, userId) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return false;
    const room = snapshot.data();
    if (room.phase !== PHASES.CLAIMING || getActivePlayerId(room) !== userId) return false;
    const player = room.players?.[userId];
    const updatedPlayer = grantIncomeForTurn(player, room.turnNumber);
    if (updatedPlayer === player) return false;
    transaction.update(reference, {
      players: { ...room.players, [userId]: updatedPlayer },
      lastAction: { type: 'income', actorId: userId, turnNumber: room.turnNumber, at: Timestamp.now() },
    });
    return true;
  });
}

export async function claimRegion(roomCode, userId, regionId) {
  await ensureTurnIncome(roomCode, userId);
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
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
      lastAction: { type: 'claim', actorId: userId, regionId, turnNumber: room.turnNumber, at: Timestamp.now() },
    });
    return next.phase;
  });
}

export async function endTurn(roomCode, userId) {
  await ensureTurnIncome(roomCode, userId);
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    if (room.phase !== PHASES.CLAIMING) throw new GameActionError('Bu evrede tur ilerletilemez.', 'PHASE_FROZEN');
    if (getActivePlayerId(room) !== userId) throw new GameActionError('Sıra sende değil.', 'NOT_ACTIVE');
    const next = advanceTurn(room);
    transaction.update(reference, {
      turnIndex: next.turnIndex,
      turnNumber: next.turnNumber,
      roundNumber: next.roundNumber,
      lastAction: { type: 'end_turn', actorId: userId, turnNumber: room.turnNumber, at: Timestamp.now() },
    });
    return true;
  });
}

export async function skipOfflineTurn(roomCode, hostId, now = Date.now()) {
  return runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new GameActionError('Oda bulunamadı.', 'ROOM_NOT_FOUND');
    const room = snapshot.data();
    if (room.phase !== PHASES.CLAIMING) throw new GameActionError('Bu evrede sıra atlanamaz.', 'PHASE_FROZEN');
    if (room.hostId !== hostId) throw new GameActionError('Sırayı yalnızca kurucu atlayabilir.', 'HOST_ONLY');
    const activeId = getActivePlayerId(room);
    const lastActive = timestampMillis(room.players?.[activeId]?.lastActive);
    if (!lastActive || now - lastActive < OFFLINE_SKIP_TIMEOUT) {
      throw new GameActionError('Oyuncu henüz sıra atlama süresini doldurmadı.', 'SKIP_TOO_EARLY');
    }
    const next = advanceTurn(room);
    transaction.update(reference, {
      turnIndex: next.turnIndex,
      turnNumber: next.turnNumber,
      roundNumber: next.roundNumber,
      lastAction: { type: 'skip_offline', actorId: hostId, targetId: activeId, turnNumber: room.turnNumber, at: Timestamp.now() },
    });
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
