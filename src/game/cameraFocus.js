export function focusActionKey(action) {
  if (!action) return null;
  return action.actionId || [action.turnNumber, action.type, action.actorId, action.regionId || ''].join(':');
}

export function createFocusState(action) {
  return { processedActionKey: focusActionKey(action) };
}

export function reduceFocusAction(state, action, localPlayerId) {
  const actionKey = focusActionKey(action);
  if (!actionKey || actionKey === state.processedActionKey) return { state, effect: null };
  const nextState = { processedActionKey: actionKey };
  if (action.type !== 'claim' || action.actorId === localPlayerId || !action.regionId) {
    return { state: nextState, effect: null };
  }
  return {
    state: nextState,
    effect: { type: 'remote_claim', actionId: actionKey, regionId: action.regionId },
  };
}
