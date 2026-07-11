import { describe, expect, it } from 'vitest';
import { BASE_INCOME } from '../constants';
import { calculateIncome } from './economy';

const mapDefinition = {
  regionsById: {
    a: { id: 'a', income: 600 },
    b: { id: 'b', income: 900 },
  },
};

describe('economy', () => {
  it('adds base income and defined region incomes', () => {
    const claims = { a: { ownerId: 'p1' }, b: { ownerId: 'p2' } };
    expect(calculateIncome(mapDefinition, claims, 'p1')).toBe(BASE_INCOME + 600);
  });

  it('calculates a zero-region player base saving yield without granting it automatically', () => {
    expect(calculateIncome(mapDefinition, {}, 'new')).toBe(BASE_INCOME);
  });
});
