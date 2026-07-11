import { describe, expect, it } from 'vitest';
import { PHASES } from './phases';
import { applyAttack, resolveDeterministicCombat } from './warCombat';
import { applyBuildPort, applyBuyShips, applyRecruitSoldiers, grantTurnIncome } from './warEconomy';
import { applyTransfer, hasFriendlyLandPath } from './warMovement';
import {
  applyMobilizationReady,
  applyWarAttack,
  applyWarTransfer,
  resolveVictory,
  skipWarTurnState,
  startMobilizationState,
  surrenderPlayerState,
} from './warState';

function room(overrides = {}) {
  const regionIds = ['a', 'b', 'c', 'd'];
  const regions = [
    { id: 'a', name: 'A', income: 500, coastal: true, seaNeighbors: ['d'], landNeighbors: ['b'], claimNeighbors: ['b'] },
    { id: 'b', name: 'B', income: 600, coastal: false, seaNeighbors: [], landNeighbors: ['a', 'c'], claimNeighbors: ['a', 'c'] },
    { id: 'c', name: 'C', income: 700, coastal: false, seaNeighbors: [], landNeighbors: ['b'], claimNeighbors: ['b'] },
    { id: 'd', name: 'D', income: 800, coastal: true, seaNeighbors: ['a'], landNeighbors: [], claimNeighbors: [] },
  ];
  const players = {
    p1: { id: 'p1', name: 'P1', money: 0, income: 6100, regionIds: ['a', 'b'], lastIncomeTurn: 0, eliminated: false },
    p2: { id: 'p2', name: 'P2', money: 0, income: 5700, regionIds: ['c'], lastIncomeTurn: 0, eliminated: false },
    p3: { id: 'p3', name: 'P3', money: 0, income: 5800, regionIds: ['d'], lastIncomeTurn: 0, eliminated: false },
  };
  return {
    schemaVersion: 4,
    phase: PHASES.WAR,
    hostId: 'p1',
    mapDefinition: { version: 1, regionIds, regions, regionsById: Object.fromEntries(regions.map((region) => [region.id, region])) },
    players,
    claims: {
      a: { ownerId: 'p1', soldiers: 5000, hasPort: true, ships: 5 },
      b: { ownerId: 'p1', soldiers: 1000, hasPort: false, ships: 0 },
      c: { ownerId: 'p2', soldiers: 2000, hasPort: true, ships: 2 },
      d: { ownerId: 'p3', soldiers: 1000, hasPort: false, ships: 0 },
    },
    turnOrder: ['p1', 'p2', 'p3'],
    turnIndex: 0,
    turnNumber: 9,
    roundNumber: 3,
    mobilizationPending: [],
    mobilizationTurnsRemaining: 0,
    winnerId: null,
    ...overrides,
  };
}

describe('war income and logistics', () => {
  it('grants current income exactly once for a turn', () => {
    const first = grantTurnIncome(room(), 'p1');
    const second = grantTurnIncome(first.room, 'p1');
    expect(first.granted).toBe(6100);
    expect(first.room.players.p1).toMatchObject({ money: 6100, lastIncomeTurn: 9 });
    expect(second).toMatchObject({ granted: 0, due: false });
  });

  it('applies centralized costs and rejects invalid logistics', () => {
    const funded = room({ players: { ...room().players, p1: { ...room().players.p1, money: 100000, lastIncomeTurn: 9 } } });
    const recruited = applyRecruitSoldiers(funded, 'p1', 'b', 2);
    expect(recruited.room.players.p1.money).toBe(80000);
    expect(recruited.room.claims.b.soldiers).toBe(3000);
    expect(applyRecruitSoldiers(funded, 'p1', 'b', 0).eligibility.code).toBe('INVALID_COUNT');
    expect(applyBuildPort(funded, 'p1', 'b').eligibility.code).toBe('NOT_COASTAL');
    expect(applyBuildPort(funded, 'p1', 'a').eligibility.code).toBe('HAS_PORT');
    expect(applyBuyShips(funded, 'p1', 'b', 1).eligibility.code).toBe('PORT_REQUIRED');
    expect(applyBuyShips(funded, 'p1', 'a', 2).room.claims.a.ships).toBe(7);
  });
});

describe('movement', () => {
  it('finds a multi-region owned land path and rejects a disconnected transfer', () => {
    const state = room({ claims: { ...room().claims, c: { ...room().claims.c, ownerId: 'p1' } } });
    expect(hasFriendlyLandPath(state.mapDefinition, state.claims, 'p1', 'a', 'c')).toBe(true);
    expect(applyTransfer(state, 'p1', 'a', 'c', 1000, 'land').room.claims.c.soldiers).toBe(3000);
    expect(applyTransfer(room(), 'p1', 'a', 'd', 1000, 'land').eligibility.code).toBe('INVALID_TARGET');
  });

  it('moves by direct sea route with persistent ship capacity', () => {
    const state = room({ claims: { ...room().claims, d: { ...room().claims.d, ownerId: 'p1' } } });
    const moved = applyTransfer(state, 'p1', 'a', 'd', 3000, 'naval');
    expect(moved.eligibility).toMatchObject({ legal: true, shipsNeeded: 3 });
    expect(moved.room.claims.a).toMatchObject({ soldiers: 2000, ships: 5 });
    expect(moved.room.claims.d.soldiers).toBe(4000);
    expect(applyTransfer(state, 'p1', 'a', 'd', 6000, 'naval').eligibility.code).toBe('INSUFFICIENT_SOLDIERS');
  });
});

describe('deterministic combat and campaign lifecycle', () => {
  it('resolves success, failure, tie, and zero defense without randomness', () => {
    expect(resolveDeterministicCombat(3000, 2000)).toEqual({ captured: true, attackersRemaining: 1000, defendersRemaining: 0 });
    expect(resolveDeterministicCombat(1000, 2000)).toEqual({ captured: false, attackersRemaining: 0, defendersRemaining: 1000 });
    expect(resolveDeterministicCombat(2000, 2000)).toEqual({ captured: false, attackersRemaining: 0, defendersRemaining: 0 });
    expect(resolveDeterministicCombat(1000, 0)).toEqual({ captured: true, attackersRemaining: 1000, defendersRemaining: 0 });
  });

  it('supports a partial land attack and preserves a captured port while destroying target ships', () => {
    const attacked = applyAttack(room(), 'p1', 'b', 'c', 1000, 'land');
    expect(attacked.eligibility.result.captured).toBe(false);
    expect(attacked.room.claims.b.soldiers).toBe(0);
    expect(attacked.room.claims.c).toMatchObject({ ownerId: 'p2', soldiers: 1000, hasPort: true, ships: 2 });

    const captureState = room({ claims: { ...room().claims, b: { ...room().claims.b, soldiers: 4000 } } });
    const captured = applyAttack(captureState, 'p1', 'b', 'c', 3000, 'land');
    expect(captured.room.claims.c).toMatchObject({ ownerId: 'p1', soldiers: 1000, hasPort: true, ships: 0 });
    expect(captured.room.players.p1.regionIds).toEqual(['a', 'b', 'c']);
    expect(captured.room.players.p2).toMatchObject({ regionIds: [], income: 5000 });
  });

  it('supports naval attacks and advances past an eliminated player before or after the actor', () => {
    const naval = applyWarAttack(room(), 'p1', 'a', 'd', 2000, 'naval');
    expect(naval.eligibility.result.captured).toBe(true);
    expect(naval.room.players.p3.eliminated).toBe(true);
    expect(naval.room.turnOrder).toEqual(['p1', 'p2']);
    expect(naval.room.turnOrder[naval.room.turnIndex]).toBe('p2');

    const beforeBase = room();
    const before = room({
      turnOrder: ['p2', 'p1', 'p3'],
      turnIndex: 1,
      claims: { ...beforeBase.claims, b: { ...beforeBase.claims.b, soldiers: 4000 } },
    });
    const captureBefore = applyWarAttack(before, 'p1', 'b', 'c', 3000, 'land');
    expect(captureBefore.room.turnOrder[captureBefore.room.turnIndex]).toBe('p3');
  });

  it('starts after the final claimant and gives every player one mobilization turn', () => {
    const claimed = room({ phase: PHASES.CLAIM_COMPLETE, turnIndex: 1, turnNumber: 8, roundNumber: 3 });
    let started = startMobilizationState(claimed, 'p1').room;
    expect(started.phase).toBe(PHASES.MOBILIZATION);
    expect(started.turnOrder[started.turnIndex]).toBe('p3');
    expect(Object.values(started.claims).every((claim) => claim.soldiers === 1000 && claim.hasPort === false && claim.ships === 0)).toBe(true);
    const seen = [];
    while (started.phase === PHASES.MOBILIZATION) {
      const active = started.turnOrder[started.turnIndex];
      seen.push(active);
      started = applyMobilizationReady(started, active).room;
    }
    expect(seen).toEqual(['p3', 'p1', 'p2']);
    expect(started.phase).toBe(PHASES.WAR);
    expect(started.turnOrder[started.turnIndex]).toBe('p3');
  });

  it('finishes with one owner even while surrendered neutral territory remains', () => {
    const surrendered = surrenderPlayerState(room(), 'p2').room;
    const surrenderedAgain = surrenderPlayerState(surrendered, 'p3').room;
    expect(surrenderedAgain.phase).toBe(PHASES.FINISHED);
    expect(surrenderedAgain.winnerId).toBe('p1');
    expect(surrenderedAgain.claims.c).toMatchObject({ ownerId: null, soldiers: 0, ships: 0, hasPort: true });
    expect(resolveVictory(surrenderedAgain).winnerId).toBe('p1');
  });

  it('treats mobilization surrender and offline skip as one completed preparation turn without skipped income', () => {
    const mobilizing = startMobilizationState(room({ phase: PHASES.CLAIM_COMPLETE, turnIndex: 2 }), 'p1').room;
    const active = mobilizing.turnOrder[mobilizing.turnIndex];
    const activeMoney = mobilizing.players[active].money;
    const skipped = skipWarTurnState({
      ...mobilizing,
      players: { ...mobilizing.players, [active]: { ...mobilizing.players[active], money: 0, lastIncomeTurn: 0 } },
    }).room;
    expect(skipped.mobilizationTurnsRemaining).toBe(mobilizing.mobilizationTurnsRemaining - 1);
    expect(skipped.players[active].money).toBe(0);
    expect(activeMoney).toBeGreaterThan(0);

    const surrendering = startMobilizationState(room({ phase: PHASES.CLAIM_COMPLETE, turnIndex: 0 }), 'p1').room;
    const target = surrendering.turnOrder[1];
    const surrendered = surrenderPlayerState(surrendering, target).room;
    expect(surrendered.players[target]).toBeUndefined();
    expect(surrendered.mobilizationPending).not.toContain(target);
    expect(Object.values(surrendered.claims).filter((claim) => claim.ownerId === null).length).toBeGreaterThan(0);
  });

  it('grants income before a legal transfer and ends the turn once', () => {
    const state = room({ claims: { ...room().claims, c: { ...room().claims.c, ownerId: 'p1' } } });
    const result = applyWarTransfer(state, 'p1', 'a', 'c', 1000, 'land');
    expect(result.room.players.p1.money).toBe(6800);
    expect(result.room.turnNumber).toBe(10);
    expect(result.room.turnOrder[result.room.turnIndex]).toBe('p2');
  });
});
