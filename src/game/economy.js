import { BASE_INCOME } from '../constants';

export function safeMoney(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function calculateIncome(mapDefinition, claims = {}, playerId) {
  const regionsById = mapDefinition?.regionsById || Object.fromEntries(
    (mapDefinition?.regions || []).map((region) => [region.id, region]),
  );
  return Object.entries(claims).reduce((total, [regionId, claim]) => {
    if (claim?.ownerId !== playerId) return total;
    const income = regionsById[regionId]?.income;
    return total + (Number.isFinite(income) && income >= 0 ? income : 0);
  }, BASE_INCOME);
}

export function grantIncomeForTurn(player, turnNumber) {
  if (!player || !Number.isInteger(turnNumber) || turnNumber < 1) return player;
  if ((player.lastIncomeTurn || 0) >= turnNumber) return player;
  const income = Number.isFinite(player.income) && player.income >= 0 ? player.income : BASE_INCOME;
  return {
    ...player,
    money: safeMoney(player.money) + income,
    lastIncomeTurn: turnNumber,
  };
}
