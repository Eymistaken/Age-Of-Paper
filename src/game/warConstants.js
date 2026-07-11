export const SOLDIER_BATCH = 1000;
export const SOLDIER_COST = 10000;
export const PORT_COST = 30000;
export const SHIP_COST = 20000;
export const SHIP_CAPACITY = 1000;
export const INITIAL_REGION_SOLDIERS = 1000;
export const WAR_SCHEMA_VERSION = 4;

export function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function isSoldierAmount(value) {
  return isPositiveInteger(value) && value % SOLDIER_BATCH === 0;
}

export function requiredShips(amount) {
  return isSoldierAmount(amount) ? Math.ceil(amount / SHIP_CAPACITY) : Infinity;
}
