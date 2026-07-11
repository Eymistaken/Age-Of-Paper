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
