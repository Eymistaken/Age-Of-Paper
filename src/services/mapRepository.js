const DATABASE_NAME = 'age-of-paper-maps';
const DATABASE_VERSION = 1;
const MAP_STORE = 'maps';
const BASE_STORE = 'baseAssets';
const METADATA_STORE = 'metadataAssets';

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB işlemi başarısız.'));
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction başarısız.'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction iptal edildi.'));
  });
}

class MemoryMapRepository {
  constructor() {
    this.maps = new Map();
    this.baseAssets = new Map();
    this.metadataAssets = new Map();
  }

  async savePreparedMap(record) {
    const now = Date.now();
    const previous = this.maps.get(record.mapId);
    const saved = {
      repositorySchemaVersion: DATABASE_VERSION,
      ...previous,
      ...structuredClone(record),
      createdAt: previous?.createdAt || record.createdAt || now,
      updatedAt: record.updatedAt || now,
    };
    this.maps.set(saved.mapId, saved);
    return structuredClone(saved);
  }

  async listPreparedMaps() {
    return [...this.maps.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((record) => structuredClone(record));
  }

  async getPreparedMap(mapId) {
    return this.maps.has(mapId) ? structuredClone(this.maps.get(mapId)) : null;
  }

  async duplicatePreparedMap(mapId, overrides = {}) {
    const source = await this.getPreparedMap(mapId);
    if (!source) throw new Error('Kopyalanacak yerel harita bulunamadı.');
    return this.savePreparedMap({
      ...source,
      mapId: overrides.mapId || `map_${globalThis.crypto?.randomUUID?.() || Date.now()}`,
      displayName: overrides.displayName || `${source.displayName} — Kopya`,
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceLabel: 'Yerel kopya',
    });
  }

  async deletePreparedMap(mapId) {
    this.maps.delete(mapId);
  }

  async putMapAsset(kind, hash, value) {
    const store = kind === 'base' ? this.baseAssets : this.metadataAssets;
    const record = { ...structuredClone(value), hash, updatedAt: Date.now() };
    store.set(hash, record);
    return structuredClone(record);
  }

  async getMapAsset(kind, hash) {
    const store = kind === 'base' ? this.baseAssets : this.metadataAssets;
    return store.has(hash) ? structuredClone(store.get(hash)) : null;
  }
}

class IndexedDbMapRepository {
  constructor(database) {
    this.database = database;
  }

  async savePreparedMap(record) {
    const transaction = this.database.transaction(MAP_STORE, 'readwrite');
    const store = transaction.objectStore(MAP_STORE);
    const previous = await requestPromise(store.get(record.mapId));
    const now = Date.now();
    const saved = {
      repositorySchemaVersion: DATABASE_VERSION,
      ...previous,
      ...record,
      createdAt: previous?.createdAt || record.createdAt || now,
      updatedAt: record.updatedAt || now,
    };
    store.put(saved);
    await transactionComplete(transaction);
    return saved;
  }

  async listPreparedMaps() {
    const transaction = this.database.transaction(MAP_STORE, 'readonly');
    const records = await requestPromise(transaction.objectStore(MAP_STORE).getAll());
    return records.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getPreparedMap(mapId) {
    const transaction = this.database.transaction(MAP_STORE, 'readonly');
    return (await requestPromise(transaction.objectStore(MAP_STORE).get(mapId))) || null;
  }

  async duplicatePreparedMap(mapId, overrides = {}) {
    const source = await this.getPreparedMap(mapId);
    if (!source) throw new Error('Kopyalanacak yerel harita bulunamadı.');
    return this.savePreparedMap({
      ...source,
      mapId: overrides.mapId || `map_${globalThis.crypto?.randomUUID?.() || Date.now()}`,
      displayName: overrides.displayName || `${source.displayName} — Kopya`,
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceLabel: 'Yerel kopya',
    });
  }

  async deletePreparedMap(mapId) {
    const transaction = this.database.transaction(MAP_STORE, 'readwrite');
    transaction.objectStore(MAP_STORE).delete(mapId);
    await transactionComplete(transaction);
  }

  async putMapAsset(kind, hash, value) {
    const storeName = kind === 'base' ? BASE_STORE : METADATA_STORE;
    const transaction = this.database.transaction(storeName, 'readwrite');
    const record = { ...value, hash, updatedAt: Date.now() };
    transaction.objectStore(storeName).put(record);
    await transactionComplete(transaction);
    return record;
  }

  async getMapAsset(kind, hash) {
    const storeName = kind === 'base' ? BASE_STORE : METADATA_STORE;
    const transaction = this.database.transaction(storeName, 'readonly');
    return (await requestPromise(transaction.objectStore(storeName).get(hash))) || null;
  }
}

export function decideAssetFetch(manifest, cached = {}) {
  if (cached.base?.hash !== manifest?.baseSvgHash) return 'full';
  if (cached.metadata?.hash !== manifest?.metadataHash) return 'metadata';
  return 'none';
}

export async function openMapRepository({ indexedDB = globalThis.indexedDB } = {}) {
  if (!indexedDB?.open) return new MemoryMapRepository();
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(MAP_STORE)) database.createObjectStore(MAP_STORE, { keyPath: 'mapId' });
    if (!database.objectStoreNames.contains(BASE_STORE)) database.createObjectStore(BASE_STORE, { keyPath: 'hash' });
    if (!database.objectStoreNames.contains(METADATA_STORE)) database.createObjectStore(METADATA_STORE, { keyPath: 'hash' });
  };
  return new IndexedDbMapRepository(await requestPromise(request));
}
