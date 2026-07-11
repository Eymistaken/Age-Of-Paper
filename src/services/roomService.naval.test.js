import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  room: null,
  update: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('../config/firebase', () => ({ db: { kind: 'test-db' } }));
vi.mock('firebase/firestore', () => ({
  FieldPath: class FieldPath {},
  Timestamp: { now: () => ({ kind: 'timestamp' }) },
  doc: (_db, collection, id) => ({ collection, id }),
  runTransaction: firestore.runTransaction,
  serverTimestamp: () => ({ kind: 'server-timestamp' }),
  updateDoc: vi.fn(),
}));

import { configureNavalMap } from './roomService';

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
  firestore.runTransaction.mockReset();
  firestore.runTransaction.mockImplementation(async (_db, operation) => operation({
    get: async () => ({ exists: () => true, data: () => firestore.room }),
    update: firestore.update,
  }));
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
