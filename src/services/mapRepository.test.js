import { describe, expect, it } from 'vitest';
import { decideAssetFetch, openMapRepository } from './mapRepository';

function fakeIndexedDb() {
  const stores = new Map();
  const database = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name) { stores.set(name, new Map()); },
    transaction(name) {
      const values = stores.get(name);
      const transaction = {
        objectStore: () => ({
          get(key) { return request(() => structuredClone(values.get(key))); },
          getAll() { return request(() => [...values.values()].map((value) => structuredClone(value))); },
          put(value) { values.set(value.mapId || value.hash, structuredClone(value)); queueMicrotask(() => transaction.oncomplete?.()); },
          delete(key) { values.delete(key); queueMicrotask(() => transaction.oncomplete?.()); },
        }),
      };
      return transaction;
    },
  };
  function request(read) {
    const result = {};
    queueMicrotask(() => {
      try { result.result = read(); result.onsuccess?.(); }
      catch (error) { result.error = error; result.onerror?.(); }
    });
    return result;
  }
  return {
    open() {
      const result = { result: database };
      queueMicrotask(() => { result.onupgradeneeded?.(); result.onsuccess?.(); });
      return result;
    },
  };
}

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

  it('upserts one stable identity and preserves it after a repository reopen', async () => {
    const indexedDB = fakeIndexedDb();
    const firstSession = await openMapRepository({ indexedDB });
    await firstSession.savePreparedMap({ mapId: 'stable', displayName: 'İlk', createdAt: 100, updatedAt: 110 });
    await firstSession.savePreparedMap({ mapId: 'stable', displayName: 'Düzenlendi', createdAt: 999, updatedAt: 120 });
    expect(await firstSession.listPreparedMaps()).toHaveLength(1);

    const afterReload = await openMapRepository({ indexedDB });
    expect(await afterReload.getPreparedMap('stable')).toMatchObject({
      mapId: 'stable', displayName: 'Düzenlendi', createdAt: 100, updatedAt: 120,
    });
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
