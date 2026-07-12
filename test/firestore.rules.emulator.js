import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  doc,
  getDoc,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const projectId = 'demo-age-of-paper';
let environment;

function player(id, index = 0) {
  const colors = ['#2F6FA3', '#A33A32', '#4F7A45', '#C89B3C', '#6B4C9A', '#2A7F78', '#C56A2D', '#9B4F7A', '#5F6B73', '#7A5132'];
  const now = Timestamp.fromMillis(1_700_000_000_000 + index);
  return {
    id,
    name: id,
    color: colors[index],
    money: 0,
    income: 5000,
    regionIds: [],
    joinedAt: now,
    lastActive: now,
    lastIncomeTurn: 0,
    eliminated: false,
  };
}

function pendingRequest(uid, requiredVoterIds = [], overrides = {}) {
  const createdAt = Timestamp.now();
  return {
    uid,
    name: uid,
    createdAt,
    expiresAt: Timestamp.fromMillis(createdAt.toMillis() + 600_000),
    updatedAt: createdAt,
    status: 'pending',
    requiredVoterIds,
    approvals: {},
    rejections: {},
    decisionAt: null,
    decidedBy: null,
    ...overrides,
  };
}

function roomData(playerIds = ['host', 'a'], overrides = {}) {
  const players = Object.fromEntries(playerIds.map((id, index) => [id, player(id, index)]));
  return {
    schemaVersion: 4,
    phase: 'claiming',
    hostId: 'host',
    createdAt: Timestamp.now(),
    mapSvg: '<svg/>',
    mapDefinition: {
      version: 1,
      pricingVersion: 2,
      regionIds: ['r1', 'r2'],
      regionsById: {
        r1: { id: 'r1', price: 5000, income: 500, claimNeighbors: ['r2'], landNeighbors: ['r2'], coastal: true, seaNeighbors: ['r2'] },
        r2: { id: 'r2', price: 5000, income: 500, claimNeighbors: ['r1'], landNeighbors: ['r1'], coastal: true, seaNeighbors: ['r1'] },
      },
    },
    mapValidation: { valid: true },
    players,
    turnOrder: [...playerIds],
    turnIndex: 0,
    turnNumber: 3,
    roundNumber: 2,
    claims: { r1: { ownerId: 'host', claimedAtTurn: 1 } },
    chat: [],
    lastAction: null,
    joinRequests: {},
    joinRequestAction: null,
    mobilizationTurnsRemaining: 0,
    mobilizationPending: [],
    winnerId: null,
    completedAt: null,
    ...overrides,
  };
}

function context(uid) {
  return environment.authenticatedContext(uid).firestore();
}

async function seed(code, data) {
  await environment.withSecurityRulesDisabled(async (admin) => {
    await setDoc(doc(admin.firestore(), 'rooms', code), data);
  });
}

function terminalRequest(request, actor, status = 'accepted') {
  const now = Timestamp.now();
  return { ...request, status, updatedAt: now, decisionAt: now, decidedBy: actor };
}

async function acceptUpdate(db, code, room, requesterId, actorId) {
  const request = room.joinRequests[requesterId];
  const now = Timestamp.now();
  return updateDoc(doc(db, 'rooms', code), {
    players: { ...room.players, [requesterId]: { ...player(requesterId, Object.keys(room.players).length), name: request.name, joinedAt: now, lastActive: now } },
    turnOrder: [...room.turnOrder, requesterId],
    joinRequests: { ...room.joinRequests, [requesterId]: terminalRequest(request, actorId) },
    joinRequestAction: { type: 'accept', actorId, requesterId, at: now },
  });
}

function economyRoom(overrides = {}) {
  const room = roomData(['host', 'a']);
  const r3 = { id: 'r3', price: 5000, income: 500, claimNeighbors: ['r2'], landNeighbors: ['r2'], coastal: false, seaNeighbors: [] };
  return {
    ...room,
    mapDefinition: {
      ...room.mapDefinition,
      regionIds: ['r1', 'r2', 'r3'],
      regionsById: {
        ...room.mapDefinition.regionsById,
        r2: { ...room.mapDefinition.regionsById.r2, claimNeighbors: ['r1', 'r3'] },
        r3,
      },
    },
    players: {
      ...room.players,
      host: { ...room.players.host, money: 10_000, income: 5500, regionIds: ['r1'] },
    },
    ...overrides,
  };
}

function nextTurn(room) {
  const turnIndex = (room.turnIndex + 1) % room.turnOrder.length;
  return {
    turnIndex,
    turnNumber: room.turnNumber + 1,
    roundNumber: room.roundNumber + (turnIndex === 0 ? 1 : 0),
  };
}

function warRoom(overrides = {}) {
  const base = roomData(['host', 'a']);
  return {
    ...base,
    phase: 'war',
    turnNumber: 3,
    turnIndex: 0,
    roundNumber: 2,
    players: {
      host: { ...base.players.host, money: 100_000, income: 5500, regionIds: ['r1'], lastIncomeTurn: 3 },
      a: { ...base.players.a, money: 20_000, income: 5500, regionIds: ['r2'], lastIncomeTurn: 2 },
    },
    claims: {
      r1: { ownerId: 'host', claimedAtTurn: 1, soldiers: 5000, hasPort: true, ships: 3 },
      r2: { ownerId: 'a', claimedAtTurn: 2, soldiers: 2000, hasPort: true, ships: 2 },
    },
    ...overrides,
  };
}

function recruitUpdate(room, overrides = {}) {
  return {
    players: { ...room.players, host: { ...room.players.host, money: 90_000 } },
    claims: { ...room.claims, r1: { ...room.claims.r1, soldiers: 6000 } },
    lastAction: {
      type: 'recruit_soldiers', actorId: 'host', regionId: 'r1', count: 1, cost: 10_000,
      turnNumber: 3, actionId: '3:recruit_soldiers:host:r1', at: Timestamp.now(),
    },
    ...overrides,
  };
}

function buildPortUpdate(room, overrides = {}) {
  return {
    players: { ...room.players, host: { ...room.players.host, money: room.players.host.money - 30_000 } },
    claims: { ...room.claims, r1: { ...room.claims.r1, hasPort: true } },
    lastAction: {
      type: 'build_port', actorId: 'host', regionId: 'r1', count: 1, cost: 30_000,
      turnNumber: room.turnNumber, actionId: `${room.turnNumber}:build_port:host:r1`, at: Timestamp.now(),
    },
    ...overrides,
  };
}

function captureUpdate(room, overrides = {}) {
  return {
    phase: 'finished',
    players: {
      host: { ...room.players.host, income: 6000, regionIds: ['r1', 'r2'] },
      a: { ...room.players.a, income: 5000, regionIds: [], eliminated: true },
    },
    claims: {
      r1: { ...room.claims.r1, soldiers: 2000 },
      r2: { ...room.claims.r2, ownerId: 'host', soldiers: 1000, ships: 0 },
    },
    turnOrder: ['host'],
    turnIndex: 0,
    turnNumber: 4,
    roundNumber: 2,
    mobilizationTurnsRemaining: 0,
    mobilizationPending: [],
    winnerId: 'host',
    completedAt: Timestamp.now(),
    lastAction: {
      type: 'land_attack', actorId: 'host', sourceId: 'r1', targetId: 'r2', amount: 3000,
      previousOwnerId: 'a', success: true, winnerId: 'host', path: null,
      turnNumber: 3, actionId: '3:land_attack:host:r2', at: Timestamp.now(),
    },
    ...overrides,
  };
}

function saveIncomeUpdate(room, actorId, overrides = {}) {
  const oldPlayer = room.players[actorId];
  return {
    players: {
      ...room.players,
      [actorId]: {
        ...oldPlayer,
        money: oldPlayer.money + oldPlayer.income,
        lastIncomeTurn: room.turnNumber,
      },
    },
    ...nextTurn(room),
    lastAction: {
      type: 'save_income', actorId, turnNumber: room.turnNumber,
      actionId: `${room.turnNumber}:save_income:${actorId}`, at: Timestamp.now(),
    },
    ...overrides,
  };
}

function claimUpdate(room, actorId, regionId, overrides = {}) {
  const oldPlayer = room.players[actorId];
  const region = room.mapDefinition.regionsById[regionId];
  const claims = { ...room.claims, [regionId]: { ownerId: actorId, claimedAtTurn: room.turnNumber } };
  const completesMap = Object.keys(claims).length === room.mapDefinition.regionIds.length;
  return {
    phase: completesMap ? 'claim_complete' : 'claiming',
    players: {
      ...room.players,
      [actorId]: {
        ...oldPlayer,
        money: oldPlayer.money - region.price,
        income: oldPlayer.income + region.income,
        regionIds: [...oldPlayer.regionIds, regionId],
      },
    },
    claims,
    ...(completesMap ? {
      turnIndex: room.turnIndex,
      turnNumber: room.turnNumber,
      roundNumber: room.roundNumber,
    } : nextTurn(room)),
    lastAction: {
      type: 'claim', actorId, regionId, turnNumber: room.turnNumber,
      actionId: `${room.turnNumber}:claim:${actorId}:${regionId}`, at: Timestamp.now(),
    },
    ...overrides,
  };
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterEach(async () => environment.clearFirestore());
afterAll(async () => environment.cleanup());

describe('join request security rules', () => {
  it('rejects an eleventh direct lobby player', async () => {
    const ids = ['host', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const room = roomData(ids, { phase: 'lobby', turnOrder: [], turnIndex: 0, turnNumber: 0, roundNumber: 0, claims: {} });
    await seed('FULL', room);
    await assertFails(updateDoc(doc(context('late'), 'rooms', 'FULL'), {
      players: { ...room.players, late: player('late', 0) },
    }));
  });

  it('rejects adding a player without a request', async () => {
    const room = roomData();
    await seed('NOPE', room);
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'NOPE'), {
      players: { ...room.players, x: player('x', 2) },
      turnOrder: [...room.turnOrder, 'x'],
    }));
  });

  it('allows an outsider to create only their own valid request', async () => {
    const room = roomData();
    await seed('MAKE', room);
    const request = pendingRequest('new', ['a']);
    await assertSucceeds(updateDoc(doc(context('new'), 'rooms', 'MAKE'), {
      joinRequests: { new: request },
      joinRequestAction: { type: 'create', actorId: 'new', requesterId: 'new', at: Timestamp.now() },
    }));
    const stored = (await getDoc(doc(context('new'), 'rooms', 'MAKE'))).data();
    await assertFails(updateDoc(doc(context('other'), 'rooms', 'MAKE'), {
      joinRequests: { ...stored.joinRequests, new: { ...stored.joinRequests.new, name: 'hijacked' } },
      joinRequestAction: { type: 'create', actorId: 'other', requesterId: 'new', at: Timestamp.now() },
    }));
  });

  it('does not let a normal player accept alone, but host acceptance succeeds', async () => {
    const request = pendingRequest('new', ['a']);
    const room = roomData(['host', 'a'], { joinRequests: { new: request } });
    await seed('HOST', room);
    await assertFails(acceptUpdate(context('a'), 'HOST', room, 'new', 'a'));
    await assertSucceeds(acceptUpdate(context('host'), 'HOST', room, 'new', 'host'));
  });

  it('allows complete non-host unanimity and rejects incomplete unanimity', async () => {
    const incompleteRequest = pendingRequest('new', ['a', 'b'], { approvals: { a: true } });
    const incomplete = roomData(['host', 'a', 'b'], { joinRequests: { new: incompleteRequest } });
    await seed('MISS', incomplete);
    await assertFails(acceptUpdate(context('a'), 'MISS', incomplete, 'new', 'a'));

    const request = { ...incompleteRequest, approvals: { a: true, b: true } };
    const complete = { ...incomplete, joinRequests: { new: request } };
    await seed('ALL', complete);
    await assertSucceeds(acceptUpdate(context('a'), 'ALL', complete, 'new', 'a'));
  });

  it('prevents changing another voter’s vote', async () => {
    const request = pendingRequest('new', ['a', 'b']);
    const room = roomData(['host', 'a', 'b'], { joinRequests: { new: request } });
    await seed('VOTE', room);
    await assertFails(updateDoc(doc(context('a'), 'rooms', 'VOTE'), {
      joinRequests: { new: { ...request, approvals: { b: true }, updatedAt: Timestamp.now() } },
      joinRequestAction: { type: 'approve', actorId: 'a', requesterId: 'new', at: Timestamp.now() },
    }));
  });

  it('cannot accept after applicant cancellation', async () => {
    const request = pendingRequest('new', ['a']);
    const room = roomData(['host', 'a'], { joinRequests: { new: request } });
    await seed('STOP', room);
    const now = Timestamp.now();
    await assertSucceeds(updateDoc(doc(context('new'), 'rooms', 'STOP'), {
      joinRequests: { new: terminalRequest(request, 'new', 'cancelled') },
      joinRequestAction: { type: 'cancel', actorId: 'new', requesterId: 'new', at: now },
    }));
    const latest = (await getDoc(doc(context('host'), 'rooms', 'STOP'))).data();
    await assertFails(acceptUpdate(context('host'), 'STOP', latest, 'new', 'host'));
  });

  it('enforces ten players and serializes two requests racing for the last seat', async () => {
    const ids = ['host', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const first = pendingRequest('x', ids.slice(1));
    const second = pendingRequest('y', ids.slice(1));
    const room = roomData(ids, { joinRequests: { x: first, y: second } });
    await seed('RACE', room);
    const db = context('host');
    const acceptInTransaction = (requesterId) => runTransaction(db, async (transaction) => {
      const reference = doc(db, 'rooms', 'RACE');
      const snapshot = await transaction.get(reference);
      const current = snapshot.data();
      const request = current.joinRequests[requesterId];
      const now = Timestamp.now();
      transaction.update(reference, {
        players: { ...current.players, [requesterId]: { ...player(requesterId, Object.keys(current.players).length), joinedAt: now, lastActive: now } },
        turnOrder: [...current.turnOrder, requesterId],
        joinRequests: { ...current.joinRequests, [requesterId]: terminalRequest(request, 'host') },
        joinRequestAction: { type: 'accept', actorId: 'host', requesterId, at: now },
      });
    });
    const results = await Promise.allSettled([acceptInTransaction('x'), acceptInTransaction('y')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('rejects acceptance in claim_complete', async () => {
    const request = pendingRequest('new', ['a']);
    const room = roomData(['host', 'a'], {
      phase: 'claim_complete',
      claims: { r1: { ownerId: 'host' }, r2: { ownerId: 'a' } },
      joinRequests: { new: request },
    });
    await seed('DONE', room);
    await assertFails(acceptUpdate(context('host'), 'DONE', room, 'new', 'host'));
  });
});

describe('single-choice turn economy security rules', () => {
  it('rejects adding saving income to the treasury during a claim', async () => {
    const room = economyRoom();
    await seed('CLAIM_PAY', room);
    const update = claimUpdate(room, 'host', 'r2');
    update.players.host.money += room.players.host.income;
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'CLAIM_PAY'), update));
  });

  it('rejects changing claims or region IDs during save-income', async () => {
    const room = economyRoom();
    await seed('SAVE_CLAIM', room);
    const update = saveIncomeUpdate(room, 'host', {
      claims: { ...room.claims, r2: { ownerId: 'host', claimedAtTurn: room.turnNumber } },
    });
    update.players.host.regionIds = [...update.players.host.regionIds, 'r2'];
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'SAVE_CLAIM'), update));
  });

  it('rejects two save-income actions for the same turn snapshot', async () => {
    const room = economyRoom();
    await seed('SAVE_TWICE', room);
    const update = saveIncomeUpdate(room, 'host');
    await assertSucceeds(updateDoc(doc(context('host'), 'rooms', 'SAVE_TWICE'), update));
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'SAVE_TWICE'), update));
  });

  it('rejects the legacy automatic income action', async () => {
    const room = economyRoom();
    await seed('OLD_INCOME', room);
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'OLD_INCOME'), {
      players: {
        ...room.players,
        host: {
          ...room.players.host,
          money: room.players.host.money + room.players.host.income,
          lastIncomeTurn: room.turnNumber,
        },
      },
      lastAction: { type: 'income', actorId: 'host', turnNumber: room.turnNumber, at: Timestamp.now() },
    }));
  });

  it('rejects save-income after a claim from the same turn snapshot', async () => {
    const room = economyRoom();
    await seed('CLAIM_SAVE', room);
    await assertSucceeds(updateDoc(doc(context('host'), 'rooms', 'CLAIM_SAVE'), claimUpdate(room, 'host', 'r2')));
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'CLAIM_SAVE'), saveIncomeUpdate(room, 'host')));
  });

  it('rejects a claim after save-income from the same turn snapshot', async () => {
    const room = economyRoom();
    await seed('SAVE_CLAIM_2', room);
    await assertSucceeds(updateDoc(doc(context('host'), 'rooms', 'SAVE_CLAIM_2'), saveIncomeUpdate(room, 'host')));
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'SAVE_CLAIM_2'), claimUpdate(room, 'host', 'r2')));
  });

  it('rejects both actions from a non-active player', async () => {
    const room = economyRoom();
    await seed('INACTIVE', room);
    await assertFails(updateDoc(doc(context('a'), 'rooms', 'INACTIVE'), saveIncomeUpdate(room, 'a')));
    await assertFails(updateDoc(doc(context('a'), 'rooms', 'INACTIVE'), claimUpdate({
      ...room,
      players: { ...room.players, a: { ...room.players.a, money: 10_000 } },
    }, 'a', 'r3')));
  });

  it('allows a correct claim to deduct only price and advance the turn', async () => {
    const room = economyRoom();
    await seed('CLAIM_OK', room);
    await assertSucceeds(updateDoc(doc(context('host'), 'rooms', 'CLAIM_OK'), claimUpdate(room, 'host', 'r2')));
    const stored = (await getDoc(doc(context('host'), 'rooms', 'CLAIM_OK'))).data();
    expect(stored.players.host.money).toBe(5000);
    expect(stored.turnNumber).toBe(4);
    expect(stored.turnIndex).toBe(1);
  });

  it('allows correct save-income to add the exact yield and advance the turn', async () => {
    const room = economyRoom();
    await seed('SAVE_OK', room);
    await assertSucceeds(updateDoc(doc(context('host'), 'rooms', 'SAVE_OK'), saveIncomeUpdate(room, 'host')));
    const stored = (await getDoc(doc(context('host'), 'rooms', 'SAVE_OK'))).data();
    expect(stored.players.host.money).toBe(15_500);
    expect(stored.players.host.regionIds).toEqual(['r1']);
    expect(stored.turnNumber).toBe(4);
  });

  it('rejects automatic money for the first player when the game starts', async () => {
    const claiming = economyRoom();
    const lobby = {
      ...claiming,
      schemaVersion: 4,
      phase: 'lobby',
      claims: {},
      turnOrder: [],
      turnIndex: 0,
      turnNumber: 0,
      roundNumber: 0,
      players: Object.fromEntries(Object.entries(claiming.players).map(([id, value]) => [id, {
        ...value, money: 0, income: 5000, regionIds: [], lastIncomeTurn: 0,
      }])),
    };
    await seed('START_ZERO', lobby);
    const paidPlayers = { ...lobby.players, host: { ...lobby.players.host, money: 5000, lastIncomeTurn: 1 } };
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'START_ZERO'), {
      phase: 'claiming', players: paidPlayers, claims: {}, turnOrder: ['host', 'a'],
      turnIndex: 0, turnNumber: 1, roundNumber: 1,
      lastAction: { type: 'start', actorId: 'host', turnNumber: 1, at: Timestamp.now() },
    }));
    await assertSucceeds(updateDoc(doc(context('host'), 'rooms', 'START_ZERO'), {
      phase: 'claiming', players: lobby.players, claims: {}, turnOrder: ['host', 'a'],
      turnIndex: 0, turnNumber: 1, roundNumber: 1,
      lastAction: { type: 'start', actorId: 'host', turnNumber: 1, at: Timestamp.now() },
    }));
    const stored = (await getDoc(doc(context('host'), 'rooms', 'START_ZERO'))).data();
    expect(stored.players.host.money).toBe(0);
  });

  it('allows a validated manifest-backed room to start with an empty legacy mapSvg', async () => {
    const claiming = economyRoom();
    const lobby = {
      ...claiming,
      phase: 'lobby', claims: {}, turnOrder: [], turnIndex: 0, turnNumber: 0, roundNumber: 0,
      mapSvg: '',
      mapManifest: {
        version: 1, mapId: 'map_neutral', displayName: 'Neutral Map', revision: 1,
        baseSvgHash: 'abc123', metadataHash: 'def456', metadataSchemaVersion: 1,
        analysisAlgorithmVersion: 'terrain-grid-v1', mapDefinitionVersion: 1,
      },
      players: Object.fromEntries(Object.entries(claiming.players).map(([id, value]) => [id, {
        ...value, money: 0, income: 5000, regionIds: [], lastIncomeTurn: 0,
      }])),
    };
    await seed('START_MANIFEST', lobby);
    await assertSucceeds(updateDoc(doc(context('host'), 'rooms', 'START_MANIFEST'), {
      phase: 'claiming', players: lobby.players, claims: {}, turnOrder: ['host', 'a'],
      turnIndex: 0, turnNumber: 1, roundNumber: 1,
      lastAction: { type: 'start', actorId: 'host', turnNumber: 1, at: Timestamp.now() },
    }));
  });

  it('keeps an accepted player at zero money', async () => {
    const request = pendingRequest('new', ['a']);
    const room = roomData(['host', 'a'], { joinRequests: { new: request } });
    await seed('JOIN_ZERO', room);
    await assertSucceeds(acceptUpdate(context('host'), 'JOIN_ZERO', room, 'new', 'host'));
    const stored = (await getDoc(doc(context('host'), 'rooms', 'JOIN_ZERO'))).data();
    expect(stored.players.new.money).toBe(0);
  });

  it('allows a final claim to enter claim-complete without income or turn advance', async () => {
    const base = economyRoom();
    const room = {
      ...base,
      mapDefinition: {
        ...base.mapDefinition,
        regionIds: ['r1', 'r2'],
        regionsById: { r1: base.mapDefinition.regionsById.r1, r2: base.mapDefinition.regionsById.r2 },
      },
    };
    await seed('FINAL', room);
    await assertSucceeds(updateDoc(doc(context('host'), 'rooms', 'FINAL'), claimUpdate(room, 'host', 'r2')));
    const stored = (await getDoc(doc(context('host'), 'rooms', 'FINAL'))).data();
    expect(stored.phase).toBe('claim_complete');
    expect(stored.players.host.money).toBe(5000);
    expect(stored.turnNumber).toBe(room.turnNumber);
    expect(stored.turnIndex).toBe(room.turnIndex);
  });
});

describe('lobby naval configuration security rules', () => {
  function navalLobby() {
    const base = roomData(['host', 'a'], {
      phase: 'lobby', turnOrder: [], turnIndex: 0, turnNumber: 0, roundNumber: 0, claims: {},
    });
    return {
      ...base,
      mapDefinition: {
        ...base.mapDefinition,
        regionsById: {
          r1: { ...base.mapDefinition.regionsById.r1, coastal: false, seaNeighbors: [] },
          r2: { ...base.mapDefinition.regionsById.r2, coastal: false, seaNeighbors: [] },
        },
      },
    };
  }

  function combinedRouteUpdate(room, actorId = 'host') {
    return {
      mapDefinition: {
        ...room.mapDefinition,
        regionsById: {
          r1: { ...room.mapDefinition.regionsById.r1, coastal: true, seaNeighbors: ['r2'] },
          r2: { ...room.mapDefinition.regionsById.r2, coastal: true, seaNeighbors: ['r1'] },
        },
      },
      mapValidation: { valid: true },
      lastAction: {
        type: 'naval_config', actorId, editType: 'create_route', firstId: 'r1', secondId: 'r2',
        regionId: null, connected: true, actionId: `naval:${actorId}`, at: Timestamp.now(),
      },
    };
  }

  it('allows the host to save both coastal endpoints and their symmetric route in one write', async () => {
    const room = navalLobby();
    await seed('NAVAL_HOST', room);
    await assertSucceeds(updateDoc(doc(context('host'), 'rooms', 'NAVAL_HOST'), combinedRouteUpdate(room)));
    const stored = (await getDoc(doc(context('host'), 'rooms', 'NAVAL_HOST'))).data();
    expect(stored.mapDefinition.regionsById.r1).toMatchObject({ coastal: true, seaNeighbors: ['r2'] });
    expect(stored.mapDefinition.regionsById.r2).toMatchObject({ coastal: true, seaNeighbors: ['r1'] });
  });

  it('rejects the same mutation from a non-host or after the lobby', async () => {
    const room = navalLobby();
    await seed('NAVAL_MEMBER', room);
    await assertFails(updateDoc(doc(context('a'), 'rooms', 'NAVAL_MEMBER'), combinedRouteUpdate(room, 'a')));
    const started = { ...room, phase: 'claiming', turnOrder: ['host', 'a'], turnIndex: 0, turnNumber: 1, roundNumber: 1 };
    await seed('NAVAL_STARTED', started);
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'NAVAL_STARTED'), combinedRouteUpdate(started)));
  });
});

describe('content addressed map asset security rules', () => {
  const manifest = {
    version: 1,
    mapId: 'map_neutral',
    displayName: 'Neutral Map',
    revision: 1,
    baseSvgHash: 'abc123',
    metadataHash: 'def456',
    metadataSchemaVersion: 1,
    analysisAlgorithmVersion: 'terrain-grid-v1',
    mapDefinitionVersion: 1,
  };

  function lobby() {
    return roomData(['host', 'a'], {
      phase: 'lobby', turnOrder: [], turnIndex: 0, turnNumber: 0, roundNumber: 0, claims: {}, mapManifest: null,
    });
  }

  const baseAsset = {
    kind: 'base_svg', schemaVersion: 1, hash: 'abc123', svg: '<svg/>', size: 6,
    createdAt: Timestamp.now(), createdBy: 'host',
  };

  const metadataAsset = {
    kind: 'metadata', schemaVersion: 1, hash: 'def456', mapId: 'map_neutral', revision: 1,
    metadata: { schemaVersion: 1 }, size: 19, createdAt: Timestamp.now(), createdBy: 'host',
  };

  it('allows only the lobby host to write immutable hash assets and the manifest', async () => {
    const room = lobby();
    await seed('ASSET_HOST', room);
    await assertSucceeds(setDoc(doc(context('host'), 'rooms', 'ASSET_HOST', 'mapAssets', 'base_abc123'), baseAsset));
    await assertSucceeds(setDoc(doc(context('host'), 'rooms', 'ASSET_HOST', 'mapAssets', 'metadata_def456'), metadataAsset));
    await assertSucceeds(updateDoc(doc(context('host'), 'rooms', 'ASSET_HOST'), {
      mapSvg: '', mapManifest: manifest, mapDefinition: room.mapDefinition, mapValidation: room.mapValidation,
    }));

    await seed('ASSET_MEMBER', room);
    await assertFails(setDoc(doc(context('a'), 'rooms', 'ASSET_MEMBER', 'mapAssets', 'base_abc123'), { ...baseAsset, createdBy: 'a' }));
    await assertFails(setDoc(doc(context('a'), 'rooms', 'ASSET_MEMBER', 'mapAssets', 'metadata_def456'), { ...metadataAsset, createdBy: 'a' }));
    await assertFails(setDoc(doc(context('outsider'), 'rooms', 'ASSET_MEMBER', 'mapAssets', 'metadata_def456'), { ...metadataAsset, createdBy: 'outsider' }));
    await assertFails(updateDoc(doc(context('a'), 'rooms', 'ASSET_MEMBER'), { mapSvg: '', mapManifest: manifest }));

    const started = { ...room, phase: 'claiming', turnOrder: ['host', 'a'], turnNumber: 1, roundNumber: 1 };
    await seed('ASSET_STARTED', started);
    await assertFails(setDoc(doc(context('host'), 'rooms', 'ASSET_STARTED', 'mapAssets', 'base_abc123'), baseAsset));
  });

  it('allows room members to read assets and rejects outsiders', async () => {
    const room = lobby();
    await seed('ASSET_READ', room);
    await environment.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), 'rooms', 'ASSET_READ', 'mapAssets', 'base_abc123'), baseAsset);
      await setDoc(doc(admin.firestore(), 'rooms', 'ASSET_READ', 'mapAssets', 'metadata_def456'), metadataAsset);
    });
    await assertSucceeds(getDoc(doc(context('a'), 'rooms', 'ASSET_READ', 'mapAssets', 'base_abc123')));
    await assertSucceeds(getDoc(doc(context('a'), 'rooms', 'ASSET_READ', 'mapAssets', 'metadata_def456')));
    await assertFails(getDoc(doc(context('outsider'), 'rooms', 'ASSET_READ', 'mapAssets', 'base_abc123')));
    await assertFails(getDoc(doc(context('outsider'), 'rooms', 'ASSET_READ', 'mapAssets', 'metadata_def456')));
  });
});

describe('mobilization and war security rules', () => {
  it('allows exact recruiting without advancing and rejects wrong cost or enemy recruiting', async () => {
    const room = warRoom();
    await seed('RECRUIT', room);
    await assertSucceeds(updateDoc(doc(context('host'), 'rooms', 'RECRUIT'), recruitUpdate(room)));

    await seed('BAD_COST', room);
    const wrongCost = recruitUpdate(room);
    wrongCost.players.host.money = 95_000;
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'BAD_COST'), wrongCost));

    await seed('ENEMY_BUY', room);
    const enemy = recruitUpdate(room);
    enemy.claims = { ...room.claims, r2: { ...room.claims.r2, soldiers: 3000 } };
    enemy.lastAction.regionId = 'r2';
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'ENEMY_BUY'), enemy));
  });

  it('allows exact deterministic capture and rejects fake casualties', async () => {
    const room = warRoom();
    await seed('CAPTURE', room);
    await assertSucceeds(updateDoc(doc(context('host'), 'rooms', 'CAPTURE'), captureUpdate(room)));

    await seed('FAKE_COMBAT', room);
    const fake = captureUpdate(room);
    fake.claims.r2.soldiers = 2000;
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'FAKE_COMBAT'), fake));
  });

  it('enforces explicit port permission and preserves legacy coastal fallback', async () => {
    const base = warRoom();
    const legacy = {
      ...base,
      claims: { ...base.claims, r1: { ...base.claims.r1, hasPort: false, ships: 0 } },
    };
    await seed('LEGACY_PORT', legacy);
    await assertSucceeds(updateDoc(doc(context('host'), 'rooms', 'LEGACY_PORT'), buildPortUpdate(legacy)));

    const denied = {
      ...legacy,
      mapDefinition: {
        ...legacy.mapDefinition,
        regionsById: {
          ...legacy.mapDefinition.regionsById,
          r1: { ...legacy.mapDefinition.regionsById.r1, portAllowed: false },
        },
      },
    };
    await seed('DENIED_PORT', denied);
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'DENIED_PORT'), buildPortUpdate(denied)));
  });

  it('rejects non-active attacks and naval attacks without ship capacity', async () => {
    const room = warRoom();
    const inactiveRoom = { ...room, turnIndex: 1 };
    await seed('INACTIVE_WAR', inactiveRoom);
    const inactive = captureUpdate(inactiveRoom);
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'INACTIVE_WAR'), inactive));

    await seed('NO_CAPACITY', room);
    const naval = captureUpdate(room);
    naval.lastAction.type = 'naval_attack';
    naval.claims.r1 = { ...naval.claims.r1, ships: room.claims.r1.ships };
    naval.lastAction.amount = 4000;
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'NO_CAPACITY'), naval));
  });

  it('rejects every economy action after victory', async () => {
    const room = { ...warRoom(), ...captureUpdate(warRoom()) };
    await seed('FROZEN_WAR', room);
    await assertFails(updateDoc(doc(context('host'), 'rooms', 'FROZEN_WAR'), recruitUpdate(room)));
  });
});
