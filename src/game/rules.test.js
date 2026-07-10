import { describe, expect, it } from 'vitest';
import { BASE_INCOME } from '../constants';
import { PHASES } from './phases';
import { applyClaim, getClaimEligibility, getLegalClaims, releasePlayerClaims } from './rules';

const regions = [
  { id: 'a', name: 'A', price: 4000, income: 500, landNeighbors: ['b'], claimNeighbors: ['b'], coastal: false },
  { id: 'b', name: 'B', price: 6000, income: 700, landNeighbors: ['a', 'c'], claimNeighbors: ['a', 'c'], coastal: false },
  { id: 'c', name: 'C', price: 8000, income: 900, landNeighbors: ['b'], claimNeighbors: ['b'], coastal: true },
];
const mapDefinition = {
  version: 1,
  regionIds: regions.map((region) => region.id),
  regions,
  regionsById: Object.fromEntries(regions.map((region) => [region.id, region])),
};

function eligibility(overrides = {}) {
  return getClaimEligibility({
    phase: PHASES.CLAIMING,
    mapDefinition,
    claims: {},
    playerId: 'p1',
    regionId: 'a',
    money: 20_000,
    isActive: true,
    ...overrides,
  });
}

describe('claim rules', () => {
  it('allows any neutral region as the first claim', () => {
    expect(getLegalClaims(mapDefinition, {}, 'p1')).toEqual(['a', 'b', 'c']);
    expect(eligibility().legal).toBe(true);
  });

  it('requires later claims to touch the player claim graph', () => {
    const claims = { a: { ownerId: 'p1' } };
    expect(getLegalClaims(mapDefinition, claims, 'p1')).toEqual(['b']);
    expect(eligibility({ claims, regionId: 'c' })).toMatchObject({ legal: false, code: 'NOT_CONNECTED' });
  });

  it('rejects an occupied region regardless of owner', () => {
    expect(eligibility({ claims: { a: { ownerId: 'p2' } } })).toMatchObject({ legal: false, code: 'OCCUPIED' });
    expect(eligibility({ claims: { a: { ownerId: 'p1' } } })).toMatchObject({ legal: false, code: 'OCCUPIED' });
  });

  it('rejects insufficient funds', () => {
    expect(eligibility({ money: 3999 })).toMatchObject({ legal: false, code: 'INSUFFICIENT_FUNDS' });
  });

  it('produces identical legal claims without viewport or zoom input', () => {
    const claims = { b: { ownerId: 'p1' } };
    const desktop = getLegalClaims(mapDefinition, claims, 'p1');
    globalThis.innerWidth = 375;
    globalThis.devicePixelRatio = 3;
    const mobile = getLegalClaims(mapDefinition, claims, 'p1');
    expect(mobile).toEqual(desktop);
    expect(mobile).toEqual(['a', 'c']);
  });

  it('moves to claim_complete when the final map region is claimed', () => {
    const room = {
      phase: PHASES.CLAIMING,
      mapDefinition,
      claims: { a: { ownerId: 'p1' }, b: { ownerId: 'p1' } },
      players: {
        p1: { id: 'p1', money: 20_000, income: BASE_INCOME + 1200, regionIds: ['a', 'b'] },
      },
      turnOrder: ['p1'],
      turnIndex: 0,
      turnNumber: 3,
      roundNumber: 3,
    };
    const result = applyClaim(room, 'p1', 'c');
    expect(result.room.phase).toBe(PHASES.CLAIM_COMPLETE);
    expect(result.room.claims.c.ownerId).toBe('p1');
    expect(result.room.turnNumber).toBe(3);
  });

  it('releases a departing player claims so the graph cannot be blocked', () => {
    const claims = { a: { ownerId: 'p2' }, b: { ownerId: 'p1' } };
    const released = releasePlayerClaims(claims, 'p1');
    expect(released).toEqual({ a: { ownerId: 'p2' } });
    expect(getLegalClaims(mapDefinition, released, 'p2')).toContain('b');
  });
});
