import { describe, expect, it } from 'vitest';
import {
  applyAutomaticPricing,
  incomeFromPrice,
  priceFromArea,
  summarizeRegionEconomy,
} from './pricing';

describe('automatic region pricing v2', () => {
  it('prices a median-sized region at 10,000', () => {
    expect(priceFromArea(100, 100)).toBe(10_000);
  });

  it('never prices a very small automatic region below 5,000', () => {
    expect(priceFromArea(0.001, 100)).toBe(5_000);
  });

  it('never prices a very large automatic region above 40,000', () => {
    expect(priceFromArea(10_000_000, 100)).toBeLessThanOrEqual(40_000);
  });

  it('rounds automatic prices to the nearest 500', () => {
    const price = priceFromArea(156, 100);
    expect(price).toBe(12_500);
    expect(price % 500).toBe(0);
  });

  it('keeps automatic income between 500 and 4,000 and rounds to 100', () => {
    expect(incomeFromPrice(5_000)).toBe(500);
    expect(incomeFromPrice(40_000)).toBe(4_000);
    expect(incomeFromPrice(12_500)).toBe(1_300);
    expect(incomeFromPrice(12_500) % 100).toBe(0);
  });

  it('preserves explicit price and income metadata', () => {
    const result = applyAutomaticPricing([
      { id: 'custom', area: 100, explicitPrice: 77_000, explicitIncome: 9_000 },
      { id: 'auto', area: 100, explicitPrice: null, explicitIncome: null },
    ]);
    expect(result.records[0]).toMatchObject({ price: 77_000, income: 9_000 });
    expect(result.records[1]).toMatchObject({ price: 10_000, income: 1_000 });
  });

  it('uses the measured-region median for an unmeasurable region fallback', () => {
    const result = applyAutomaticPricing([
      { id: 'small', area: 100, explicitPrice: null, explicitIncome: null },
      { id: 'missing', area: null, explicitPrice: null, explicitIncome: null },
      { id: 'large', area: 400, explicitPrice: null, explicitIncome: null },
    ]);
    expect(result.records.find((record) => record.id === 'missing')).toMatchObject({
      price: 10_000,
      usedAreaFallback: true,
    });
  });

  it('prevents one extreme outlier from distorting ordinary regions', () => {
    const result = applyAutomaticPricing([
      { id: 'a', area: 90, explicitPrice: null, explicitIncome: null },
      { id: 'b', area: 100, explicitPrice: null, explicitIncome: null },
      { id: 'c', area: 110, explicitPrice: null, explicitIncome: null },
      { id: 'outlier', area: 1_000_000_000, explicitPrice: null, explicitIncome: null },
    ]);
    expect(result.medianArea).toBe(105);
    expect(result.records.find((record) => record.id === 'b').price).toBe(10_000);
    expect(result.records.find((record) => record.id === 'outlier').price).toBeLessThanOrEqual(40_000);
  });

  it('keeps a USA-like size distribution inside the playable range', () => {
    const areas = [4, 7, 9, 12, 15, 18, 22, 28, 35, 45, 60, 85, 120, 170, 260, 900];
    const result = applyAutomaticPricing(areas.map((area, index) => ({
      id: `state_${index}`,
      area,
      explicitPrice: null,
      explicitIncome: null,
    })));
    const prices = result.records.map((record) => record.price);
    expect(Math.min(...prices)).toBeGreaterThanOrEqual(5_000);
    expect(Math.max(...prices)).toBeLessThanOrEqual(40_000);
    expect(prices.every((price) => price % 500 === 0)).toBe(true);
  });

  it('has no viewport or zoom input and therefore returns identical results', () => {
    const before = priceFromArea(250, 100);
    globalThis.innerWidth = 320;
    globalThis.devicePixelRatio = 3;
    const after = priceFromArea(250, 100);
    expect(after).toBe(before);
  });

  it('summarizes min, median, and max values for lobby visibility', () => {
    expect(summarizeRegionEconomy([
      { price: 5_000, income: 500 },
      { price: 10_000, income: 1_000 },
      { price: 40_000, income: 4_000 },
    ])).toEqual({
      minPrice: 5_000,
      medianPrice: 10_000,
      maxPrice: 40_000,
      minIncome: 500,
      maxIncome: 4_000,
    });
  });
});
