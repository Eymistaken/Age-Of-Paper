import { describe, expect, it } from 'vitest';
import { advanceTurn, removePlayerFromTurnState } from './turns';

describe('turn progression', () => {
  it('increments total turns and only increments round when order wraps', () => {
    const first = { turnOrder: ['a', 'b', 'c'], turnIndex: 0, turnNumber: 1, roundNumber: 1 };
    const second = advanceTurn(first);
    const third = advanceTurn(second);
    const wrapped = advanceTurn(third);
    expect(second).toMatchObject({ turnIndex: 1, turnNumber: 2, roundNumber: 1 });
    expect(third).toMatchObject({ turnIndex: 2, turnNumber: 3, roundNumber: 1 });
    expect(wrapped).toMatchObject({ turnIndex: 0, turnNumber: 4, roundNumber: 2 });
  });

  it('advances a ten-player round exactly once after all ten turns', () => {
    let state = {
      turnOrder: Array.from({ length: 10 }, (_, index) => `p${index}`),
      turnIndex: 0,
      turnNumber: 1,
      roundNumber: 1,
    };
    for (let index = 0; index < 9; index += 1) state = advanceTurn(state);
    expect(state).toMatchObject({ turnIndex: 9, turnNumber: 10, roundNumber: 1 });
    state = advanceTurn(state);
    expect(state).toMatchObject({ turnIndex: 0, turnNumber: 11, roundNumber: 2 });
  });

  it('keeps the same active player when an earlier non-active player leaves', () => {
    const result = removePlayerFromTurnState({
      turnOrder: ['a', 'b', 'c'], turnIndex: 2, turnNumber: 8, roundNumber: 3,
    }, 'a');
    expect(result.turnOrder[result.turnIndex]).toBe('c');
    expect(result.turnNumber).toBe(8);
  });

  it('selects the correct next player when the active player leaves', () => {
    const middle = removePlayerFromTurnState({
      turnOrder: ['a', 'b', 'c'], turnIndex: 1, turnNumber: 4, roundNumber: 2,
    }, 'b');
    expect(middle.turnOrder[middle.turnIndex]).toBe('c');
    expect(middle.turnNumber).toBe(5);

    const wrapped = removePlayerFromTurnState({
      turnOrder: ['a', 'c'], turnIndex: 1, turnNumber: 5, roundNumber: 2,
    }, 'c');
    expect(wrapped.turnOrder[wrapped.turnIndex]).toBe('a');
    expect(wrapped.roundNumber).toBe(3);
  });
});
