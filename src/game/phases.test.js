import { describe, expect, it } from 'vitest';
import { PHASES, canTransitionPhase, resolvePhase } from './phases';

describe('campaign phases', () => {
  it('allows only the campaign transition graph', () => {
    expect(canTransitionPhase(PHASES.LOBBY, PHASES.CLAIMING)).toBe(true);
    expect(canTransitionPhase(PHASES.CLAIMING, PHASES.CLAIM_COMPLETE)).toBe(true);
    expect(canTransitionPhase(PHASES.CLAIM_COMPLETE, PHASES.MOBILIZATION)).toBe(true);
    expect(canTransitionPhase(PHASES.MOBILIZATION, PHASES.WAR)).toBe(true);
    expect(canTransitionPhase(PHASES.WAR, PHASES.FINISHED)).toBe(true);
    expect(canTransitionPhase(PHASES.CLAIMING, PHASES.WAR)).toBe(false);
    expect(canTransitionPhase(PHASES.FINISHED, PHASES.WAR)).toBe(false);
  });

  it('resolves all current phases and safely falls back for legacy rooms', () => {
    Object.values(PHASES).forEach((phase) => expect(resolvePhase({ phase })).toBe(phase));
    expect(resolvePhase({ status: 'playing' })).toBe(PHASES.CLAIMING);
  });
});
