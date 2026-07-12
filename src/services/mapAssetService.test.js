import { describe, expect, it, vi } from 'vitest';
import { prepareSvgMap } from '../game/mapImporter';
import { buildRoomMapAssets, resolveRoomMapAssets } from './mapAssetService';
import { openMapRepository } from './mapRepository';

const svg = '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><rect id="land_a" data-terrain="land" width="50" height="50"/><rect id="water_1" data-terrain="ocean" x="50" width="50" height="50"/></svg>';

describe('content addressed room map assets', () => {
  it('reads nothing on a complete local hit and only metadata when the base matches', async () => {
    const prepared = await prepareSvgMap(svg, { displayName: 'Asset Test' });
    const assets = await buildRoomMapAssets(prepared);
    const repository = await openMapRepository({ indexedDB: null });
    await repository.putMapAsset('base', assets.manifest.baseSvgHash, assets.baseAsset);
    await repository.putMapAsset('metadata', assets.manifest.metadataHash, assets.metadataAsset);
    const fetchAsset = vi.fn();
    const hit = await resolveRoomMapAssets({ manifest: assets.manifest, repository, fetchAsset });
    expect(hit.svg).toContain('data-region="true"');
    expect(fetchAsset).not.toHaveBeenCalled();

    const metadataOnlyRepository = await openMapRepository({ indexedDB: null });
    await metadataOnlyRepository.putMapAsset('base', assets.manifest.baseSvgHash, assets.baseAsset);
    const metadataFetch = vi.fn(async (kind) => kind === 'metadata' ? assets.metadataAsset : assets.baseAsset);
    await resolveRoomMapAssets({ manifest: assets.manifest, repository: metadataOnlyRepository, fetchAsset: metadataFetch });
    expect(metadataFetch).toHaveBeenCalledTimes(1);
    expect(metadataFetch).toHaveBeenCalledWith('metadata', assets.manifest.metadataHash);
  });

  it('falls back to a full fetch after a cached metadata mismatch', async () => {
    const prepared = await prepareSvgMap(svg, { displayName: 'Fallback' });
    const assets = await buildRoomMapAssets(prepared);
    const repository = await openMapRepository({ indexedDB: null });
    await repository.putMapAsset('base', assets.manifest.baseSvgHash, assets.baseAsset);
    await repository.putMapAsset('metadata', assets.manifest.metadataHash, { ...assets.metadataAsset, metadata: { bad: true } });
    const fetchAsset = vi.fn(async (kind) => kind === 'base' ? assets.baseAsset : assets.metadataAsset);
    const resolved = await resolveRoomMapAssets({ manifest: assets.manifest, repository, fetchAsset });
    expect(resolved.svg).toContain('land_a');
    expect(fetchAsset).toHaveBeenCalledWith('base', assets.manifest.baseSvgHash);
    expect(fetchAsset).toHaveBeenCalledWith('metadata', assets.manifest.metadataHash);
  });
});
