import { describe, expect, it } from 'vitest';
import { createFocusState, reduceFocusSnapshot } from './cameraFocus';

const room = (overrides = {}) => ({
  turnOrder: ['me', 'other'], turnIndex: 1, turnNumber: 4, lastAction: null, ...overrides,
});

describe('camera focus event selection', () => {
  it('focuses a newly-started local turn then restores after the local action', () => {
    let state = createFocusState(room());
    let result = reduceFocusSnapshot(state, room({ turnIndex: 0, turnNumber: 5 }), 'me');
    expect(result.effect).toEqual({ type: 'local_turn' });
    state = result.state;
    result = reduceFocusSnapshot(state, room({
      turnIndex: 1,
      turnNumber: 6,
      lastAction: { type: 'save_income', actorId: 'me', turnNumber: 5, actionId: '5:save_income:me' },
    }), 'me');
    expect(result.effect).toEqual({ type: 'local_restore' });
  });

  it('emits a remote completed action once and ignores heartbeat/chat snapshots', () => {
    let state = createFocusState(room());
    const acted = room({
      turnIndex: 0,
      turnNumber: 5,
      lastAction: { type: 'claim', actorId: 'other', regionId: 'r2', turnNumber: 4, actionId: '4:claim:other:r2' },
    });
    let result = reduceFocusSnapshot(state, acted, 'me');
    expect(result.effect).toMatchObject({ type: 'remote_action', actionType: 'claim', regionId: 'r2' });
    expect(result.effect.localTurnStarted).toBe(true);
    state = result.state;
    result = reduceFocusSnapshot(state, { ...acted, chat: [{ id: 'm1' }] }, 'me');
    expect(result.effect).toBeNull();
  });

  it('marks automation cancelled after manual interaction', () => {
    const state = createFocusState(room(), { automationCancelled: true });
    const result = reduceFocusSnapshot(state, room({ turnIndex: 0, turnNumber: 5 }), 'me');
    expect(result.effect).toBeNull();
  });
});
