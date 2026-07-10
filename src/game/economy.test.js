import { describe, expect, it } from 'vitest';
import { BASE_INCOME } from '../constants';
import { calculateIncome, grantIncomeForTurn } from './economy';

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

  it('grants income at most once for the same turn number', () => {
    const player = { money: 1000, income: 5600, lastIncomeTurn: 2 };
    const once = grantIncomeForTurn(player, 3);
    const twice = grantIncomeForTurn(once, 3);
    expect(once.money).toBe(6600);
    expect(twice).toEqual(once);
  });
});
