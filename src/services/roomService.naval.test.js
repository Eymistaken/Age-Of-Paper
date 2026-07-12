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
import { configureNavalMap, setRoomMap } from './roomService';

function lobbyRoom() {
  const regions = ['a', 'b'].map((id) => ({
    id,
    name: id.toUpperCase(),
    price: 5000,
    income: 500,
    coastal: false,
    seaNeighbors: [],
    landNeighbors: [id === 'a' ? 'b' : 'a'],
    claimNeighbors: [id === 'a' ? 'b' : 'a'],
  }));
  return {
    phase: 'lobby',
    hostId: 'host',
    mapDefinition: {
      version: 1,
      regionIds: ['a', 'b'],
      regions,
      regionsById: Object.fromEntries(regions.map((region) => [region.id, region])),
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
});

describe('configureNavalMap atomic route transaction', () => {
  it('writes both coastal flags and both route edges in one transaction update', async () => {
    const result = await configureNavalMap('ABCD', 'host', {
      type: 'create_route', firstId: 'a', secondId: 'b',
    });
    expect(result).toMatchObject({ ok: true, autoMarkedRegionIds: ['a', 'b'] });
    expect(firestore.runTransaction).toHaveBeenCalledOnce();
    expect(firestore.update).toHaveBeenCalledOnce();
    const [, update] = firestore.update.mock.calls[0];
    expect(update.mapDefinition.regionsById.a).toMatchObject({ coastal: true, seaNeighbors: ['b'] });
    expect(update.mapDefinition.regionsById.b).toMatchObject({ coastal: true, seaNeighbors: ['a'] });
    expect(update.lastAction).toMatchObject({ type: 'naval_config', editType: 'create_route', connected: true });
  });

  it('does not write when the requested route already exists', async () => {
    firestore.room.mapDefinition.regionsById.a = firestore.room.mapDefinition.regions[0] = {
      ...firestore.room.mapDefinition.regionsById.a, coastal: true, seaNeighbors: ['b'],
    };
    firestore.room.mapDefinition.regionsById.b = firestore.room.mapDefinition.regions[1] = {
      ...firestore.room.mapDefinition.regionsById.b, coastal: true, seaNeighbors: ['a'],
    };
    await expect(configureNavalMap('ABCD', 'host', {
      type: 'create_route', firstId: 'a', secondId: 'b',
    })).rejects.toMatchObject({ code: 'DUPLICATE_ROUTE' });
    expect(firestore.update).not.toHaveBeenCalled();
  });
});
