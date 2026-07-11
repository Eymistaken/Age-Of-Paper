import { describe, expect, it } from 'vitest';
import { createFocusState, reduceFocusAction } from './cameraFocus';

const action = (overrides = {}) => ({
  type: 'claim',
  actorId: 'other',
  regionId: 'texas',
  turnNumber: 4,
  actionId: '4:claim:other:texas',
  ...overrides,
});

describe('camera focus event selection', () => {
  it('emits each new remote claim exactly once', () => {
    let state = createFocusState(null);
    let result = reduceFocusAction(state, action(), 'me');
    expect(result.effect).toEqual({ type: 'remote_claim', actionId: action().actionId, regionId: 'texas' });
    state = result.state;
    result = reduceFocusAction(state, action(), 'me');
    expect(result.effect).toBeNull();
  });

  it('ignores remote save-income, local claims, and turn-only snapshots', () => {
    let state = createFocusState(null);
    let result = reduceFocusAction(state, action({ type: 'save_income', regionId: undefined, actionId: '4:save:other' }), 'me');
    expect(result.effect).toBeNull();
    state = result.state;
    result = reduceFocusAction(state, action({ actorId: 'me', actionId: '5:claim:me:texas' }), 'me');
    expect(result.effect).toBeNull();
    expect(reduceFocusAction(result.state, null, 'me').effect).toBeNull();
  });

  it('does not replay an action already present when the component mounts', () => {
    const oldAction = action();
    const state = createFocusState(oldAction);
    expect(reduceFocusAction(state, oldAction, 'me').effect).toBeNull();
  });

  it('ignores heartbeat and presence snapshots that keep the same action ID', () => {
    const first = reduceFocusAction(createFocusState(null), action(), 'me');
    const heartbeat = { ...action(), at: 12345 };
    expect(reduceFocusAction(first.state, heartbeat, 'me').effect).toBeNull();
  });
});
