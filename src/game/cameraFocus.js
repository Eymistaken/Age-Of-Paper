const ACTION_TYPES = new Set(['claim', 'save_income']);

export function focusActionKey(action) {
  if (!action || !ACTION_TYPES.has(action.type)) return null;
  return action.actionId || [action.turnNumber, action.type, action.actorId, action.regionId || ''].join(':');
}

function activePlayerId(room) {
  return room?.turnOrder?.[room.turnIndex] || null;
}

export function createFocusState(room, overrides = {}) {
  return {
    activePlayerId: activePlayerId(room),
    turnNumber: room?.turnNumber || 0,
    processedActionKey: focusActionKey(room?.lastAction),
    automationCancelled: false,
    ...overrides,
  };
}

export function reduceFocusSnapshot(state, room, localPlayerId) {
  const nextActiveId = activePlayerId(room);
  const nextActionKey = focusActionKey(room?.lastAction);
  const nextState = {
    ...state,
    activePlayerId: nextActiveId,
    turnNumber: room?.turnNumber || state.turnNumber,
    processedActionKey: nextActionKey || state.processedActionKey,
  };
  if (state.automationCancelled) return { state: nextState, effect: null };

  if (nextActionKey && nextActionKey !== state.processedActionKey) {
    const action = room.lastAction;
    if (action.actorId === localPlayerId) return { state: nextState, effect: { type: 'local_restore' } };
    return {
      state: nextState,
      effect: {
        type: 'remote_action',
        actionType: action.type,
        actorId: action.actorId,
        regionId: action.regionId || null,
        actionKey: nextActionKey,
        localTurnStarted: nextActiveId === localPlayerId && state.activePlayerId !== localPlayerId,
      },
    };
  }

  if (nextActiveId === localPlayerId && state.activePlayerId !== localPlayerId) {
    return { state: nextState, effect: { type: 'local_turn' } };
  }
  return { state: nextState, effect: null };
}
