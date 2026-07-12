import { describe, expect, it } from 'vitest';
import { PHASES } from './phases';
import { createWarPlan, getWarHighlights, selectWarRegion, startWarPlan, WAR_INTERACTION_MODES } from './warUiState';

const room = {
  phase: PHASES.WAR,
  players: { p1: { eliminated: false }, p2: { eliminated: false } },
  turnOrder: ['p1', 'p2'], turnIndex: 0,
  claims: {
    a: { ownerId: 'p1', soldiers: 2000, hasPort: true, ships: 2 },
    b: { ownerId: 'p2', soldiers: 1000, hasPort: false, ships: 0 },
  },
  mapDefinition: {
    regionIds: ['a', 'b'],
    regionsById: {
      a: { id: 'a', coastal: true, seaNeighbors: ['b'], landNeighbors: ['b'] },
      b: { id: 'b', coastal: true, seaNeighbors: ['a'], landNeighbors: ['a'] },
    },
  },
};

describe('war interaction state', () => {
  it('uses explicit source and target modes', () => {
    let plan = startWarPlan('attack', 'land');
    expect(plan.mode).toBe(WAR_INTERACTION_MODES.SELECTING_ATTACK_SOURCE);
    plan = selectWarRegion(room, 'p1', plan, 'a');
    expect(plan).toMatchObject({ mode: WAR_INTERACTION_MODES.SELECTING_ATTACK_TARGET, sourceId: 'a' });
    plan = selectWarRegion(room, 'p1', plan, 'b');
    expect(plan.targetId).toBe('b');
  });

  it('highlights only legal sources and targets and reset is idle', () => {
    const plan = selectWarRegion(room, 'p1', startWarPlan('move', 'naval'), 'a');
    expect(getWarHighlights(room, 'p1', plan)).toMatchObject({
      sources: ['a'], targets: [], invalidTargets: ['b'],
      targetStates: { b: { code: 'ENEMY_TRANSFER_TARGET' } },
    });
    expect(createWarPlan().mode).toBe(WAR_INTERACTION_MODES.IDLE);
  });
});
