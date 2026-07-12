import { describe, expect, it } from 'vitest';
import { decideAssetFetch, openMapRepository } from './mapRepository';

describe('local prepared map repository', () => {
  it('persists, sorts, duplicates and deletes maps without localStorage', async () => {
    const repository = await openMapRepository({ indexedDB: null });
    await repository.savePreparedMap({ mapId: 'older', displayName: 'Eski', updatedAt: 10 });
    await repository.savePreparedMap({ mapId: 'newer', displayName: 'Yeni', updatedAt: 20 });
    expect((await repository.listPreparedMaps()).map((item) => item.mapId)).toEqual(['newer', 'older']);
    const duplicate = await repository.duplicatePreparedMap('newer', { mapId: 'copy' });
    expect(duplicate).toMatchObject({ mapId: 'copy', displayName: 'Yeni — Kopya' });
    await repository.deletePreparedMap('older');
    expect(await repository.getPreparedMap('older')).toBeNull();
  });

  it('stores content addressed base and metadata assets separately', async () => {
    const repository = await openMapRepository({ indexedDB: null });
    await repository.putMapAsset('base', 'abc', { svg: '<svg/>' });
    await repository.putMapAsset('metadata', 'def', { metadata: { schemaVersion: 1 } });
    expect(await repository.getMapAsset('base', 'abc')).toMatchObject({ hash: 'abc', svg: '<svg/>' });
    expect(await repository.getMapAsset('metadata', 'def')).toMatchObject({ hash: 'def' });
  });

  it('chooses no read, metadata-only read, or full read by manifest hashes', () => {
    const manifest = { baseSvgHash: 'base', metadataHash: 'meta' };
    expect(decideAssetFetch(manifest, { base: { hash: 'base' }, metadata: { hash: 'meta' } })).toBe('none');
    expect(decideAssetFetch(manifest, { base: { hash: 'base' }, metadata: null })).toBe('metadata');
    expect(decideAssetFetch(manifest, { base: null, metadata: { hash: 'meta' } })).toBe('full');
    expect(decideAssetFetch(manifest, { base: { hash: 'old' }, metadata: { hash: 'meta' } })).toBe('full');
  });
});
