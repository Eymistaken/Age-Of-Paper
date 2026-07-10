export const PRICING_VERSION = 2;
export const MIN_AUTOMATIC_PRICE = 5_000;
export const MAX_AUTOMATIC_PRICE = 40_000;
export const MIN_AUTOMATIC_INCOME = 500;
export const MAX_AUTOMATIC_INCOME = 4_000;

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function roundToNearest(value, step) {
  return Math.round(value / step) * step;
}

export function priceFromArea(regionArea, medianRegionArea) {
  const safeMedian = Number.isFinite(medianRegionArea) && medianRegionArea > 0 ? medianRegionArea : 1;
  const safeArea = Number.isFinite(regionArea) && regionArea > 0 ? regionArea : safeMedian;
  const sizeFactor = clamp(Math.sqrt(safeArea / safeMedian), 0.5, 3);
  const price = clamp(10_000 * sizeFactor, MIN_AUTOMATIC_PRICE, MAX_AUTOMATIC_PRICE);
  return roundToNearest(price, 500);
}

export function incomeFromPrice(price) {
  const income = clamp(price * 0.1, MIN_AUTOMATIC_INCOME, MAX_AUTOMATIC_INCOME);
  return roundToNearest(income, 100);
}

export function applyAutomaticPricing(records) {
  const measuredAreas = records
    .map((record) => record.area)
    .filter((area) => Number.isFinite(area) && area > 0);
  const medianArea = median(measuredAreas) || 1;
  return {
    medianArea,
    records: records.map((record) => {
      const hasMeasuredArea = Number.isFinite(record.area) && record.area > 0;
      const automaticPrice = priceFromArea(hasMeasuredArea ? record.area : medianArea, medianArea);
      const price = Number.isFinite(record.explicitPrice) ? record.explicitPrice : automaticPrice;
      const income = Number.isFinite(record.explicitIncome) ? record.explicitIncome : incomeFromPrice(price);
      return {
        ...record,
        price,
        income,
        usedAreaFallback: !hasMeasuredArea,
        automaticPrice: !Number.isFinite(record.explicitPrice),
        automaticIncome: !Number.isFinite(record.explicitIncome),
      };
    }),
  };
}

export function summarizeRegionEconomy(regions) {
  const prices = regions.map((region) => region.price).filter(Number.isFinite);
  const incomes = regions.map((region) => region.income).filter(Number.isFinite);
  if (!prices.length || !incomes.length) return null;
  return {
    minPrice: Math.min(...prices),
    medianPrice: median(prices),
    maxPrice: Math.max(...prices),
    minIncome: Math.min(...incomes),
    maxIncome: Math.max(...incomes),
  };
}
