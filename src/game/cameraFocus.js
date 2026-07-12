export function focusActionKey(action) {
  if (!action) return null;
  return action.actionId || [action.turnNumber, action.type, action.actorId, action.targetId || action.regionId || ''].join(':');
}

export function createFocusState(action) {
  return { processedActionKey: focusActionKey(action) };
}

export function reduceFocusAction(state, action, localPlayerId) {
  const actionKey = focusActionKey(action);
  if (!actionKey || actionKey === state.processedActionKey) return { state, effect: null };
  const nextState = { processedActionKey: actionKey };
  const regionId = action.targetId || action.regionId;
  const effectTypes = {
    claim: 'remote_claim',
    land_transfer: 'remote_operation',
    land_attack: 'remote_operation',
  };
  if (!effectTypes[action.type] || action.actorId === localPlayerId || !regionId) {
    return { state: nextState, effect: null };
  }
  return {
    state: nextState,
    effect: { type: effectTypes[action.type], actionId: actionKey, regionId },
  };
}
