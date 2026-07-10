export const PHASES = Object.freeze({
  LOBBY: 'lobby',
  CLAIMING: 'claiming',
  CLAIM_COMPLETE: 'claim_complete',
});

export const FUTURE_PHASES = Object.freeze([
  'mobilization',
  'war',
  'finished',
]);

const TRANSITIONS = Object.freeze({
  [PHASES.LOBBY]: [PHASES.CLAIMING],
  [PHASES.CLAIMING]: [PHASES.CLAIM_COMPLETE],
  [PHASES.CLAIM_COMPLETE]: [],
});

export function canTransitionPhase(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function resolvePhase(room = {}) {
  if (Object.values(PHASES).includes(room.phase)) return room.phase;

  // Transitional rooms used `status`. Combat fields from those rooms are
  // intentionally ignored, but the UI can still open without crashing.
  if (room.status === 'lobby') return PHASES.LOBBY;
  if (room.status === 'playing') return PHASES.CLAIMING;
  return PHASES.LOBBY;
}
