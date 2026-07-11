import { describe, expect, it } from 'vitest';
import {
  acceptJoinRequestState,
  castJoinVote,
  createJoinRequestRecord,
  getJoinVoteSummary,
  isJoinRequestExpired,
} from './joinRequests';
import { PHASES } from './phases';

function player(id, color = `#00000${id}`) {
  return { id, name: id, color, money: 0, income: 5000, regionIds: [], lastIncomeTurn: 0 };
}

function room(ids = ['host', 'a']) {
  const players = Object.fromEntries(ids.map((id, index) => [id, player(id, `color-${index}`)]));
  const base = {
    phase: PHASES.CLAIMING,
    hostId: 'host',
    players,
    turnOrder: [...ids],
    turnIndex: 1,
    turnNumber: 8,
    roundNumber: 4,
    mapDefinition: { regionIds: ['r1', 'r2'] },
    claims: { r1: { ownerId: 'host' } },
    joinRequests: {},
  };
  base.joinRequests.new = createJoinRequestRecord(base, 'new', 'Yeni', 1000, 601000);
  return base;
}

describe('in-game join requests', () => {
  it('lets the current host accept immediately without changing the active turn', () => {
    const before = room();
    const accepted = acceptJoinRequestState(before, 'new', 'host', 2000);
    expect(accepted.players.new).toMatchObject({ money: 0, income: 5000, regionIds: [], lastIncomeTurn: 0 });
    expect(accepted.turnOrder).toEqual(['host', 'a', 'new']);
    expect(accepted).toMatchObject({ turnIndex: 1, turnNumber: 8, roundNumber: 4 });
  });

  it('accepts after every snapshotted non-host voter approves', () => {
    const afterVote = castJoinVote(room(), 'new', 'a', 'approve', 1500);
    expect(getJoinVoteSummary(afterVote, afterVote.joinRequests.new).unanimous).toBe(true);
    expect(() => acceptJoinRequestState(afterVote, 'new', 'a', 2000)).not.toThrow();
  });

  it('does not treat an empty non-host voter set as unanimous', () => {
    const single = room(['host']);
    expect(getJoinVoteSummary(single, single.joinRequests.new).unanimous).toBe(false);
  });

  it('drops departed voters from the effective electorate and grants a changed host authority', () => {
    let state = room(['host', 'a', 'b']);
    state = castJoinVote(state, 'new', 'a', 'approve', 1200);
    delete state.players.b;
    state.turnOrder = state.turnOrder.filter((id) => id !== 'b');
    expect(getJoinVoteSummary(state, state.joinRequests.new).unanimous).toBe(true);
    state.hostId = 'a';
    expect(() => acceptJoinRequestState(state, 'new', 'a', 2000)).not.toThrow();
  });

  it('rejects an eleventh player and expired requests', () => {
    const full = room(['host', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
    expect(() => acceptJoinRequestState(full, 'new', 'host', 2000)).toThrow();
    expect(isJoinRequestExpired(room().joinRequests.new, 601000)).toBe(true);
  });

  it('keeps the late player at zero money until they choose to save', () => {
    const accepted = acceptJoinRequestState(room(), 'new', 'host', 2000);
    expect(accepted.players.new.money).toBe(0);
    expect(accepted.players.new.lastIncomeTurn).toBe(0);
  });
});
