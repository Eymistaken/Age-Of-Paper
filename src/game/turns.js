export function getActivePlayerId(turnState) {
  const order = turnState?.turnOrder || [];
  return order[turnState?.turnIndex] || null;
}

export function advanceTurn(turnState) {
  const order = turnState?.turnOrder || [];
  if (!order.length) return { ...turnState, turnIndex: 0 };
  const currentIndex = Math.min(Math.max(turnState.turnIndex || 0, 0), order.length - 1);
  const nextIndex = (currentIndex + 1) % order.length;
  return {
    ...turnState,
    turnIndex: nextIndex,
    turnNumber: Math.max(1, turnState.turnNumber || 1) + 1,
    roundNumber: Math.max(1, turnState.roundNumber || 1) + (nextIndex === 0 ? 1 : 0),
  };
}

export function removePlayerFromTurnState(turnState, playerId) {
  const oldOrder = turnState?.turnOrder || [];
  const removedIndex = oldOrder.indexOf(playerId);
  if (removedIndex < 0) return { ...turnState, activePlayerChanged: false };

  const oldIndex = Math.min(Math.max(turnState.turnIndex || 0, 0), Math.max(0, oldOrder.length - 1));
  const wasActive = removedIndex === oldIndex;
  const newOrder = oldOrder.filter((id) => id !== playerId);
  if (!newOrder.length) {
    return { ...turnState, turnOrder: [], turnIndex: 0, activePlayerChanged: wasActive };
  }

  let turnIndex = oldIndex;
  if (removedIndex < oldIndex) turnIndex -= 1;
  if (turnIndex >= newOrder.length) turnIndex = 0;
  const wrapped = wasActive && removedIndex === oldOrder.length - 1;

  return {
    ...turnState,
    turnOrder: newOrder,
    turnIndex,
    turnNumber: wasActive ? Math.max(1, turnState.turnNumber || 1) + 1 : turnState.turnNumber,
    roundNumber: wrapped ? Math.max(1, turnState.roundNumber || 1) + 1 : turnState.roundNumber,
    activePlayerChanged: wasActive,
  };
}
