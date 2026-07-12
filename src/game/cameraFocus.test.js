import { describe, expect, it } from 'vitest';
import { createFocusState, reduceFocusAction } from './cameraFocus';

const action = (overrides = {}) => ({
  type: 'claim',
  actorId: 'other',
  regionId: 'b',
  turnNumber: 4,
  actionId: '4:claim:other:b',
  ...overrides,
});

describe('camera focus event selection', () => {
  it('emits each new remote claim exactly once', () => {
    let state = createFocusState(null);
    let result = reduceFocusAction(state, action(), 'me');
    expect(result.effect).toEqual({ type: 'remote_claim', actionId: action().actionId, regionId: 'b' });
    state = result.state;
    result = reduceFocusAction(state, action(), 'me');
    expect(result.effect).toBeNull();
  });

  it('ignores remote save-income, local claims, and turn-only snapshots', () => {
    let state = createFocusState(null);
    let result = reduceFocusAction(state, action({ type: 'save_income', regionId: undefined, actionId: '4:save:other' }), 'me');
    expect(result.effect).toBeNull();
    state = result.state;
    result = reduceFocusAction(state, action({ actorId: 'me', actionId: '5:claim:me:b' }), 'me');
    expect(result.effect).toBeNull();
    expect(reduceFocusAction(result.state, null, 'me').effect).toBeNull();
  });

  it('does not replay an action already present when the component mounts', () => {
    const oldAction = action();
    const state = createFocusState(oldAction);
    expect(reduceFocusAction(state, oldAction, 'me').effect).toBeNull();
  });

  it('focuses land operations while naval actions wait for their ship presentation', () => {
    const attack = action({ type: 'land_attack', regionId: undefined, targetId: 'target_b', actionId: '8:land_attack:other:target_b' });
    expect(reduceFocusAction(createFocusState(null), attack, 'me').effect).toEqual({
      type: 'remote_operation', actionId: attack.actionId, regionId: 'target_b',
    });
    const naval = action({ type: 'naval_attack', regionId: undefined, targetId: 'target_b', actionId: '8:naval_attack:other:target_b' });
    expect(reduceFocusAction(createFocusState(null), naval, 'me').effect).toBeNull();
    const purchase = action({ type: 'buy_ships', regionId: 'source_a', actionId: '8:buy_ships:other:source_a' });
    expect(reduceFocusAction(createFocusState(null), purchase, 'me').effect).toBeNull();
  });

  it('ignores heartbeat and presence snapshots that keep the same action ID', () => {
    const first = reduceFocusAction(createFocusState(null), action(), 'me');
    const heartbeat = { ...action(), at: 12345 };
    expect(reduceFocusAction(first.state, heartbeat, 'me').effect).toBeNull();
  });
});
