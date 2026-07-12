import { describe, expect, it } from 'vitest';
import { createNavalPresentationState, reduceNavalPresentation, sampleNavalPresentation } from './navalPresentation';

describe('naval action presentation', () => {
  it('presents a new naval lastAction exactly once', () => {
    const old = { type: 'claim', actionId: 'old' };
    let state = createNavalPresentationState(old);
    const action = { type: 'naval_transfer', actionId: 'voyage', sourceId: 'a', targetId: 'b' };
    const first = reduceNavalPresentation(state, action);
    expect(first.effect).toMatchObject({ type: 'naval_presentation', sourceId: 'a', targetId: 'b' });
    state = first.state;
    expect(reduceNavalPresentation(state, action).effect).toBeNull();
  });

  it('does not replay the current action on mount or present land actions', () => {
    const current = { type: 'naval_attack', actionId: 'current', sourceId: 'a', targetId: 'b' };
    expect(reduceNavalPresentation(createNavalPresentationState(current), current).effect).toBeNull();
    expect(reduceNavalPresentation(createNavalPresentationState(null), { type: 'land_attack', actionId: 'land', sourceId: 'a', targetId: 'b' }).effect).toBeNull();
  });

  it('samples water movement and hides the ship during remote transition', () => {
    const path = { segments: [
      { kind: 'water', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
      { kind: 'remote_transition' },
      { kind: 'water', points: [{ x: 20, y: 0 }, { x: 30, y: 0 }] },
    ] };
    expect(sampleNavalPresentation(path, 0.1).point.x).toBeCloseTo(3);
    expect(sampleNavalPresentation(path, 0.5).visible).toBe(false);
    expect(sampleNavalPresentation(path, 0.9).point.x).toBeCloseTo(27);
  });
});
