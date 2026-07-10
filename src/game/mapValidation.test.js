import { describe, expect, it } from 'vitest';
import { validateMapDefinition } from './mapValidation';

const validRegions = [
  { id: 'north', name: 'North', price: 4000, income: 500, landNeighbors: ['south'], claimNeighbors: ['south'], coastal: false },
  { id: 'south', name: 'South', price: 5000, income: 600, landNeighbors: ['north'], claimNeighbors: ['north'], coastal: true },
];

function definition(regions = validRegions) {
  return { version: 1, regionIds: regions.map((region) => region.id), regions };
}

describe('map definition validation', () => {
  it('accepts a connected valid definition', () => {
    expect(validateMapDefinition(definition())).toMatchObject({ valid: true, regionCount: 2 });
  });

  it('rejects a map with no playable regions or an invalid number', () => {
    expect(validateMapDefinition(definition([])).errors.map((item) => item.code)).toContain('NO_REGIONS');
    const invalid = structuredClone(validRegions);
    invalid[0].price = -1;
    expect(validateMapDefinition(definition(invalid)).errors.map((item) => item.code)).toContain('INVALID_NUMBER');
  });

  it('rejects unknown neighbors', () => {
    const invalid = structuredClone(validRegions);
    invalid[0].claimNeighbors = ['missing'];
    expect(validateMapDefinition(definition(invalid)).errors.map((item) => item.code)).toContain('UNKNOWN_NEIGHBOR');
  });

  it('rejects self-neighboring regions', () => {
    const invalid = structuredClone(validRegions);
    invalid[0].claimNeighbors = ['north'];
    expect(validateMapDefinition(definition(invalid)).errors.map((item) => item.code)).toContain('SELF_NEIGHBOR');
  });

  it('rejects duplicate and unsafe region IDs', () => {
    const duplicate = structuredClone(validRegions);
    duplicate[1].id = 'north';
    expect(validateMapDefinition(definition(duplicate)).errors.map((item) => item.code)).toContain('DUPLICATE_ID');

    const unsafe = structuredClone(validRegions);
    unsafe[0].id = 'north.east';
    expect(validateMapDefinition(definition(unsafe)).errors.map((item) => item.code)).toContain('UNSAFE_ID');
  });

  it('rejects disconnected claim graphs that cannot complete from every first claim', () => {
    const disconnected = structuredClone(validRegions);
    disconnected.forEach((region) => { region.claimNeighbors = []; region.landNeighbors = []; });
    expect(validateMapDefinition(definition(disconnected)).errors.map((item) => item.code)).toContain('UNREACHABLE_REGION');
  });
});
