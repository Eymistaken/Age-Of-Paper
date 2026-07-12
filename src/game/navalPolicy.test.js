import { describe, expect, it } from 'vitest';
import {
  NAVAL_POLICIES,
  applyNavalPolicyEdit,
  getNavalTargetEligibility,
  getPlayerNavalCapability,
  isNavalRouteAllowed,
  migrateLegacyNavalPolicy,
  navalRouteKey,
  normalizeRouteList,
  normalizeRoutePair,
  resetNavalRoutes,
} from './navalPolicy';

function map(overrides = {}) {
  const regions = [
    { id: 'ocean_a', coastal: true, coastType: 'ocean', portAllowed: true, seaNeighbors: [] },
    { id: 'lake_b', coastal: true, coastType: 'lake', portAllowed: true, seaNeighbors: [] },
    { id: 'both_c', coastal: true, coastType: 'both', portAllowed: false, seaNeighbors: [] },
    { id: 'inland', coastal: false, coastType: 'none', portAllowed: false, seaNeighbors: [] },
  ];
  return {
    regionIds: regions.map((region) => region.id),
    regions,
    regionsById: Object.fromEntries(regions.map((region) => [region.id, region])),
    navalPolicy: NAVAL_POLICIES.ALL_COASTS,
    allowedRoutes: [],
    blockedRoutes: [],
    ...overrides,
  };
}

function room(mapDefinition = map()) {
  return {
    phase: 'war', turnOrder: ['p1', 'p2'], turnIndex: 0,
    players: { p1: { eliminated: false }, p2: { eliminated: false } },
    mapDefinition,
    claims: {
      ocean_a: { ownerId: 'p1', soldiers: 3000, hasPort: true, ships: 2 },
      lake_b: { ownerId: 'p2', soldiers: 1000, hasPort: false, ships: 0 },
      both_c: { ownerId: 'p1', soldiers: 1000, hasPort: false, ships: 0 },
      inland: { ownerId: 'p1', soldiers: 1000, hasPort: false, ships: 0 },
    },
  };
}

describe('naval policy', () => {
  it('normalizes unordered route pairs symmetrically and deterministically', () => {
    expect(normalizeRoutePair('lake_b', 'ocean_a')).toEqual(['lake_b', 'ocean_a']);
    expect(navalRouteKey('ocean_a', 'lake_b')).toBe(navalRouteKey('lake_b', 'ocean_a'));
    expect(normalizeRouteList([
      ['ocean_a', 'lake_b'], ['lake_b', 'ocean_a'], ['inland', 'ocean_a'], ['both_c', 'both_c'],
    ], { mapDefinition: map() })).toEqual([['lake_b', 'ocean_a']]);
  });

  it('supports all coasts with blocked exceptions, selected routes, and disabled mode', () => {
    expect(isNavalRouteAllowed(map(), 'ocean_a', 'lake_b').allowed).toBe(true);
    const blocked = map({ blockedRoutes: [['lake_b', 'ocean_a']] });
    expect(isNavalRouteAllowed(blocked, 'ocean_a', 'lake_b')).toMatchObject({ allowed: false, code: 'ROUTE_BLOCKED' });
    const selected = map({ navalPolicy: NAVAL_POLICIES.SELECTED_ROUTES, allowedRoutes: [['both_c', 'ocean_a']] });
    expect(isNavalRouteAllowed(selected, 'ocean_a', 'both_c').allowed).toBe(true);
    expect(isNavalRouteAllowed(selected, 'ocean_a', 'lake_b')).toMatchObject({ allowed: false, code: 'NO_SELECTED_ROUTE' });
    expect(isNavalRouteAllowed(map({ navalPolicy: NAVAL_POLICIES.DISABLED }), 'ocean_a', 'lake_b')).toMatchObject({ allowed: false, code: 'NAVAL_DISABLED' });
  });

  it('preserves route lists while changing mode and clears them only explicitly', () => {
    const source = map({ navalPolicy: NAVAL_POLICIES.DISABLED, allowedRoutes: ['lake_b::ocean_a'], blockedRoutes: ['both_c::ocean_a'] });
    const changed = applyNavalPolicyEdit(source, { type: 'policy', navalPolicy: NAVAL_POLICIES.ALL_COASTS });
    expect(changed.mapDefinition).toMatchObject({ allowedRoutes: ['lake_b::ocean_a'], blockedRoutes: ['both_c::ocean_a'] });
    expect(resetNavalRoutes(changed.mapDefinition)).toMatchObject({ navalPolicy: NAVAL_POLICIES.ALL_COASTS, allowedRoutes: [], blockedRoutes: [] });
  });

  it('migrates symmetric legacy seaNeighbors to selected routes without fabricating coasts', () => {
    const legacy = map();
    delete legacy.navalPolicy;
    delete legacy.allowedRoutes;
    delete legacy.blockedRoutes;
    legacy.regionsById.ocean_a.seaNeighbors = ['lake_b'];
    legacy.regionsById.lake_b.seaNeighbors = ['ocean_a'];
    const migrated = migrateLegacyNavalPolicy(legacy, { mapDefinition: legacy });
    expect(migrated).toMatchObject({ navalPolicy: NAVAL_POLICIES.SELECTED_ROUTES, allowedRoutes: [['lake_b', 'ocean_a']], migratedLegacyRoutes: true });
    expect(legacy.regionsById.inland.coastal).toBe(false);
  });

  it('opens and closes the player naval capability from current ownership', () => {
    expect(getPlayerNavalCapability(room(), 'p1')).toMatchObject({ available: true, eligibleCoasts: ['ocean_a'], hasPort: true, ships: 2 });
    const lost = room();
    lost.claims.ocean_a.ownerId = 'p2';
    expect(getPlayerNavalCapability(lost, 'p1')).toMatchObject({ available: false, eligibleCoasts: [] });
    expect(getPlayerNavalCapability(room(map({ navalPolicy: NAVAL_POLICIES.DISABLED })), 'p1').showNavalSection).toBe(false);
  });

  it('returns exact target reasons for routes, ports, capacity, soldiers and ownership', () => {
    const state = room();
    expect(getNavalTargetEligibility(state, 'p1', 'attack', 'ocean_a', 'lake_b', 1000).legal).toBe(true);
    expect(getNavalTargetEligibility(state, 'p1', 'move', 'ocean_a', 'lake_b', 1000)).toMatchObject({ code: 'ENEMY_TRANSFER_TARGET', reason: 'Bu hedef nakil için düşman bölgesi.' });
    expect(getNavalTargetEligibility(state, 'p1', 'attack', 'ocean_a', 'both_c', 1000)).toMatchObject({ code: 'FRIENDLY_ATTACK_TARGET', reason: 'Bu hedef saldırı için sana ait.' });
    expect(getNavalTargetEligibility(state, 'p1', 'attack', 'ocean_a', 'lake_b', 3000)).toMatchObject({ code: 'INSUFFICIENT_SHIPS', reason: 'Yetersiz gemi kapasitesi.' });
    const noPort = room(); noPort.claims.ocean_a.hasPort = false;
    expect(getNavalTargetEligibility(noPort, 'p1', 'attack', 'ocean_a', 'lake_b', 1000)).toMatchObject({ code: 'PORT_REQUIRED', reason: 'Liman gerekli.' });
    expect(getNavalTargetEligibility(state, 'p1', 'attack', 'ocean_a', 'inland', 1000)).toMatchObject({ code: 'STALE_COAST' });
    expect(getNavalTargetEligibility(room(map({ blockedRoutes: [['lake_b', 'ocean_a']] })), 'p1', 'attack', 'ocean_a', 'lake_b', 1000)).toMatchObject({ code: 'ROUTE_BLOCKED', reason: 'Rota engelli.' });
    expect(getNavalTargetEligibility(room(map({ navalPolicy: 'selected_routes' })), 'p1', 'attack', 'ocean_a', 'lake_b', 1000)).toMatchObject({ code: 'NO_SELECTED_ROUTE', reason: 'Özel rota bulunmuyor.' });
    expect(getNavalTargetEligibility(room(map({ navalPolicy: 'disabled' })), 'p1', 'attack', 'ocean_a', 'lake_b', 1000)).toMatchObject({ code: 'NAVAL_DISABLED', reason: 'Deniz politikası kapalı.' });
    const lowSoldiers = room(); lowSoldiers.claims.ocean_a.soldiers = 500;
    expect(getNavalTargetEligibility(lowSoldiers, 'p1', 'attack', 'ocean_a', 'lake_b', 1000)).toMatchObject({ code: 'INSUFFICIENT_SOLDIERS', reason: 'Yetersiz asker.' });
  });
});
