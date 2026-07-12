import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  room: null,
  update: vi.fn(),
  set: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('../config/firebase', () => ({ db: { kind: 'test-db' } }));
vi.mock('firebase/firestore', () => ({
  FieldPath: class FieldPath {},
  Timestamp: { now: () => ({ kind: 'timestamp' }) },
  doc: (_db, ...segments) => ({ segments }),
  runTransaction: firestore.runTransaction,
  serverTimestamp: () => ({ kind: 'server-timestamp' }),
  updateDoc: vi.fn(),
}));

import { prepareSvgMap } from '../game/mapImporter';
import { configureNavalMap, setRoomMap, startGame } from './roomService';

function lobbyRoom() {
  const regions = ['a', 'b'].map((id) => ({
    id,
    name: id.toUpperCase(),
    price: 5000,
    income: 500,
    coastal: true,
    coastType: id === 'a' ? 'ocean' : 'lake',
    portAllowed: true,
    seaNeighbors: [],
    landNeighbors: [id === 'a' ? 'b' : 'a'],
    claimNeighbors: [id === 'a' ? 'b' : 'a'],
  }));
  return {
    phase: 'lobby',
    hostId: 'host',
    mapSvg: '',
    mapManifest: {
      version: 1, mapId: 'map_manifest', displayName: 'Manifest', revision: 1,
      baseSvgHash: 'abcdef', metadataHash: 'fedcba', metadataSchemaVersion: 1,
      analysisAlgorithmVersion: 'terrain-grid-v1', mapDefinitionVersion: 1,
    },
    mapValidation: { valid: true, errors: [], warnings: [] },
    players: { host: { id: 'host', name: 'Host' }, member: { id: 'member', name: 'Member' } },
    mapDefinition: {
      version: 1,
      regionIds: ['a', 'b'],
      regions,
      regionsById: Object.fromEntries(regions.map((region) => [region.id, region])),
      navalPolicy: 'selected_routes',
      allowedRoutes: [],
      blockedRoutes: [],
    },
  };
}

beforeEach(() => {
  firestore.room = lobbyRoom();
  firestore.update.mockReset();
  firestore.set.mockReset();
  firestore.runTransaction.mockReset();
  firestore.runTransaction.mockImplementation(async (_db, operation) => operation({
    get: async (reference) => reference.segments.length === 2
      ? ({ exists: () => true, data: () => firestore.room })
      : ({ exists: () => false, data: () => null }),
    set: firestore.set,
    update: firestore.update,
  }));
});

describe('setRoomMap content-addressed transaction', () => {
  it('writes two immutable assets and the compact room manifest atomically', async () => {
    const prepared = await prepareSvgMap(`<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
      <rect id="land_a" data-terrain="land" width="40" height="50"/>
      <rect id="land_b" data-terrain="land" x="40" width="40" height="50"/>
      <rect id="water_1" data-terrain="ocean" x="80" width="20" height="50"/>
    </svg>`, { displayName: 'Atomic Map' });
    await setRoomMap('ABCD', 'host', prepared);
    expect(firestore.runTransaction).toHaveBeenCalledOnce();
    expect(firestore.set).toHaveBeenCalledTimes(2);
    expect(firestore.set.mock.calls.map(([reference]) => reference.segments.at(-1))).toEqual(expect.arrayContaining([
      `base_${prepared.baseSvgHash}`,
      `metadata_${prepared.metadataHash}`,
    ]));
    expect(firestore.update).toHaveBeenCalledOnce();
    const [, update] = firestore.update.mock.calls[0];
    expect(update.mapSvg).toBe('');
    expect(update.mapManifest).toMatchObject({ mapId: prepared.mapId, baseSvgHash: prepared.baseSvgHash, metadataHash: prepared.metadataHash });
    expect(update.mapDefinition.regionIds).toEqual(['land_a', 'land_b']);
    expect(update.mapValidation.valid).toBe(true);
  });

  it('translates a denied atomic asset/manifest commit into a contextual Turkish error', async () => {
    const prepared = await prepareSvgMap(`<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
      <rect id="land_a" data-terrain="land" width="50" height="50"/>
      <rect id="water_1" data-terrain="ocean" x="50" width="50" height="50"/>
    </svg>`);
    firestore.runTransaction.mockRejectedValueOnce({ code: 'permission-denied', message: 'Missing or insufficient permissions.' });
    await expect(setRoomMap('ABCD', 'host', prepared)).rejects.toMatchObject({
      code: 'MAP_ASSET_PERMISSION',
      message: expect.stringContaining('harita asset'),
    });
  });

  it('applies a repaired ordinary map with same-id centroid markers to the room', async () => {
    const prepared = await prepareSvgMap(`<svg viewBox="100 50 300 100" xmlns="http://www.w3.org/2000/svg">
      <polygon id="R-1" points="100,50 200,50 200,150 100,150"/><circle id="R-1" cx="150" cy="100" r="3"/>
      <polygon id="R-2" points="200,50 300,50 300,150 200,150"/><circle id="R-2" cx="250" cy="100" r="3"/>
      <polygon id="R-3" points="300,50 400,50 400,150 300,150"/><circle id="R-3" cx="350" cy="100" r="3"/>
    </svg>`, { displayName: 'Onarılmış Harita' });
    expect(prepared.validation.valid).toBe(true);
    await setRoomMap('ABCD', 'host', prepared);
    const [, update] = firestore.update.mock.calls[0];
    expect(update.mapDefinition.regionIds).toEqual(['R-1', 'R-2', 'R-3']);
    expect(update.mapValidation.valid).toBe(true);
  });

  it('rejects a previous-version draft before starting a room transaction', async () => {
    const prepared = await prepareSvgMap('<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle id="island" data-terrain="land" cx="50" cy="50" r="30"/></svg>');
    prepared.terrainDocument = { ...prepared.terrainDocument, analysisAlgorithmVersion: 'terrain-grid-v1' };
    await expect(setRoomMap('ABCD', 'host', prepared)).rejects.toMatchObject({ code: 'STALE_MAP_ANALYSIS' });
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });
});

describe('startGame map compatibility', () => {
  it('accepts a validated manifest-backed map when legacy mapSvg is empty', async () => {
    await startGame('ABCD', 'host');
    expect(firestore.update).toHaveBeenCalledOnce();
    expect(firestore.update.mock.calls[0][1]).toMatchObject({ phase: 'claiming', turnNumber: 1 });
  });
});

describe('configureNavalMap atomic policy transaction', () => {
  it('writes a normalized selected route without changing terrain-derived coasts', async () => {
    const result = await configureNavalMap('ABCD', 'host', {
      type: 'route', firstId: 'b', secondId: 'a', allowed: true,
    });
    expect(result).toMatchObject({ ok: true });
    expect(firestore.runTransaction).toHaveBeenCalledOnce();
    expect(firestore.update).toHaveBeenCalledOnce();
    const [, update] = firestore.update.mock.calls[0];
    expect(update.mapDefinition.allowedRoutes).toEqual(['a::b']);
    expect(update.mapDefinition.regionsById).toEqual(firestore.room.mapDefinition.regionsById);
    expect(update.lastAction).toMatchObject({ type: 'naval_config', editType: 'route', allowed: true });
  });

  it('does not write when a route endpoint is not a final coast', async () => {
    firestore.room.mapDefinition.regionsById.b = { ...firestore.room.mapDefinition.regionsById.b, coastal: false, coastType: 'none' };
    await expect(configureNavalMap('ABCD', 'host', {
      type: 'route', firstId: 'a', secondId: 'b', allowed: true,
    })).rejects.toMatchObject({ code: 'INVALID_ROUTE_ENDPOINT' });
    expect(firestore.update).not.toHaveBeenCalled();
  });
});
