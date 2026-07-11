import { describe, expect, it } from 'vitest';
import { setNavalRoute, setRegionCoastal } from './navalRoutes';
import { validateMapDefinition } from './mapValidation';

function map() {
  const regions = ['a', 'b', 'c'].map((id) => ({
    id,
    name: id.toUpperCase(),
    price: 5000,
    income: 500,
    coastal: false,
    seaNeighbors: [],
    landNeighbors: ['a', 'b', 'c'].filter((other) => other !== id),
    claimNeighbors: ['a', 'b', 'c'].filter((other) => other !== id),
  }));
  return { version: 1, regionIds: regions.map((region) => region.id), regions, regionsById: Object.fromEntries(regions.map((region) => [region.id, region])) };
}

describe('naval route editing and validation', () => {
  it('creates and removes a symmetric route while visibly marking endpoints coastal', () => {
    const added = setNavalRoute(map(), 'a', 'b', true);
    expect(added.ok).toBe(true);
    expect(added.autoMarkedCoastal).toBe(true);
    expect(added.mapDefinition.regionsById.a).toMatchObject({ coastal: true, seaNeighbors: ['b'] });
    expect(added.mapDefinition.regionsById.b).toMatchObject({ coastal: true, seaNeighbors: ['a'] });
    const removed = setNavalRoute(added.mapDefinition, 'a', 'b', false);
    expect(removed.mapDefinition.regionsById.a.seaNeighbors).toEqual([]);
    expect(removed.mapDefinition.regionsById.b.seaNeighbors).toEqual([]);
  });

  it('does not unmark a routed coast unless routes are removed in the same action', () => {
    const routed = setNavalRoute(map(), 'a', 'b', true).mapDefinition;
    expect(setRegionCoastal(routed, 'a', false)).toMatchObject({ ok: false, code: 'REGION_HAS_ROUTES' });
    const result = setRegionCoastal(routed, 'a', false, { removeRoutes: true });
    expect(result.mapDefinition.regionsById.a).toMatchObject({ coastal: false, seaNeighbors: [] });
    expect(result.mapDefinition.regionsById.b.seaNeighbors).toEqual([]);
  });

  it('detects asymmetric, duplicate, unknown, self, and non-coastal routes', () => {
    const definition = map();
    definition.regionsById.a = definition.regions[0] = { ...definition.regionsById.a, coastal: true, seaNeighbors: ['b', 'b', 'missing', 'a'] };
    const codes = validateMapDefinition(definition).errors.map((entry) => entry.code);
    expect(codes).toEqual(expect.arrayContaining(['DUPLICATE_ROUTE', 'UNKNOWN_NEIGHBOR', 'SELF_NEIGHBOR', 'NON_COASTAL_ROUTE', 'ASYMMETRIC_SEA_ROUTE']));
  });

  it('keeps a coast-only land map valid with a non-blocking warning', () => {
    const definition = map();
    definition.regionsById.a = definition.regions[0] = { ...definition.regionsById.a, coastal: true };
    const result = validateMapDefinition(definition);
    expect(result.valid).toBe(true);
    expect(result.warnings.map((entry) => entry.code)).toContain('COASTAL_WITHOUT_ROUTES');
  });
});
