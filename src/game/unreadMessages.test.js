import { describe, expect, it } from 'vitest';
import { initializeUnreadState, updateUnreadState } from './unreadMessages';

const messages = [
  { id: 'm1', senderId: 'other' },
  { id: 'm2', senderId: 'me' },
];

describe('unread message bookkeeping', () => {
  it('treats history as seen on the first load and counts only new foreign IDs once', () => {
    let state = initializeUnreadState(null, messages);
    expect(state.unread).toBe(0);
    state = updateUnreadState(state, [...messages, { id: 'm3', senderId: 'other' }], 'me', false);
    expect(state.unread).toBe(1);
    state = updateUnreadState(state, [...messages, { id: 'm3', senderId: 'other' }], 'me', false);
    expect(state.unread).toBe(1);
  });

  it('does not count own messages and clears when chat is truly visible', () => {
    let state = initializeUnreadState({ seenIds: [], unread: 0 }, []);
    state = updateUnreadState(state, [{ id: 'mine', senderId: 'me' }], 'me', false);
    expect(state.unread).toBe(0);
    state = updateUnreadState(state, [{ id: 'mine', senderId: 'me' }, { id: 'theirs', senderId: 'other' }], 'me', false);
    expect(state.unread).toBe(1);
    state = updateUnreadState(state, [{ id: 'theirs', senderId: 'other' }], 'me', true);
    expect(state.unread).toBe(0);
  });
});
