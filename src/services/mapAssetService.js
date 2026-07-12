import {
  applyCompactMetadataToSvg,
  canonicalJson,
  embedMapMetadata,
  hashText,
  validateMetadataPackage,
} from '../game/mapMetadata';
import { sanitizeSvgMarkup } from '../game/mapImporter';
import { decideAssetFetch } from './mapRepository';

export const MAP_MANIFEST_VERSION = 1;

function assertManifest(manifest) {
  if (!manifest || manifest.version !== MAP_MANIFEST_VERSION
    || typeof manifest.mapId !== 'string'
    || !Number.isSafeInteger(manifest.revision)
    || typeof manifest.baseSvgHash !== 'string'
    || typeof manifest.metadataHash !== 'string') {
    throw new Error('Oda harita manifesti geçersiz.');
  }
}

export async function buildRoomMapAssets(preparedMap) {
  const baseSvg = sanitizeSvgMarkup(preparedMap.baseSvg);
  if (!baseSvg || baseSvg.length > 650_000) throw new Error('Temel SVG room asset sınırını aşıyor.');
  const baseSvgHash = await hashText(baseSvg);
  if (preparedMap.baseSvgHash && preparedMap.baseSvgHash !== baseSvgHash) {
    throw new Error('Temel SVG hash doğrulaması başarısız.');
  }
  const metadata = preparedMap.compactMetadata;
  const metadataValidation = validateMetadataPackage(metadata);
  if (!metadataValidation.valid) throw new Error(metadataValidation.errors[0].message);
  const metadataHash = await hashText(canonicalJson(metadata));
  const metadataSize = canonicalJson(metadata).length;
  if (metadataSize > 450_000) throw new Error('Kompakt metadata room asset sınırını aşıyor.');
  if (preparedMap.metadataHash && preparedMap.metadataHash !== metadataHash) {
    throw new Error('Kompakt metadata hash doğrulaması başarısız.');
  }
  return {
    manifest: {
      version: MAP_MANIFEST_VERSION,
      mapId: preparedMap.mapId,
      displayName: preparedMap.displayName,
      revision: preparedMap.revision,
      baseSvgHash,
      metadataHash,
      metadataSchemaVersion: metadata.schemaVersion,
      analysisAlgorithmVersion: metadata.analysisAlgorithmVersion,
      mapDefinitionVersion: preparedMap.mapDefinition.version,
    },
    baseAsset: {
      kind: 'base_svg',
      schemaVersion: 1,
      hash: baseSvgHash,
      svg: baseSvg,
      size: baseSvg.length,
    },
    metadataAsset: {
      kind: 'metadata',
      schemaVersion: metadata.schemaVersion,
      hash: metadataHash,
      mapId: preparedMap.mapId,
      revision: preparedMap.revision,
      metadata,
      size: metadataSize,
    },
  };
}

async function verifyAssets(manifest, baseAsset, metadataAsset) {
  if (baseAsset?.kind !== 'base_svg' || baseAsset.hash !== manifest.baseSvgHash
    || metadataAsset?.kind !== 'metadata' || metadataAsset.hash !== manifest.metadataHash) {
    throw new Error('Harita asset kimliği manifest ile eşleşmiyor.');
  }
  if (await hashText(baseAsset.svg) !== manifest.baseSvgHash) throw new Error('Temel SVG asset hash değeri uyuşmuyor.');
  if (await hashText(canonicalJson(metadataAsset.metadata)) !== manifest.metadataHash) throw new Error('Metadata asset hash değeri uyuşmuyor.');
  if (metadataAsset.mapId !== manifest.mapId || metadataAsset.revision !== manifest.revision) {
    throw new Error('Metadata revision veya mapId değeri uyuşmuyor.');
  }
  const validation = validateMetadataPackage(metadataAsset.metadata);
  if (!validation.valid) throw new Error(validation.errors[0].message);
  return applyCompactMetadataToSvg(baseAsset.svg, metadataAsset.metadata);
}

async function fullFetch(manifest, fetchAsset) {
  const [baseAsset, metadataAsset] = await Promise.all([
    fetchAsset('base', manifest.baseSvgHash),
    fetchAsset('metadata', manifest.metadataHash),
  ]);
  return { baseAsset, metadataAsset };
}

export async function resolveRoomMapAssets({ manifest, repository, fetchAsset }) {
  assertManifest(manifest);
  let baseAsset = await repository.getMapAsset('base', manifest.baseSvgHash);
  let metadataAsset = await repository.getMapAsset('metadata', manifest.metadataHash);
  const decision = decideAssetFetch(manifest, { base: baseAsset, metadata: metadataAsset });
  try {
    if (decision === 'full') ({ baseAsset, metadataAsset } = await fullFetch(manifest, fetchAsset));
    else if (decision === 'metadata') metadataAsset = await fetchAsset('metadata', manifest.metadataHash);
    const svg = await verifyAssets(manifest, baseAsset, metadataAsset);
    await repository.putMapAsset('base', manifest.baseSvgHash, baseAsset);
    await repository.putMapAsset('metadata', manifest.metadataHash, metadataAsset);
    return { manifest, baseAsset, metadataAsset, svg, cacheDecision: decision };
  } catch (error) {
    if (decision === 'full') throw error;
    ({ baseAsset, metadataAsset } = await fullFetch(manifest, fetchAsset));
    const svg = await verifyAssets(manifest, baseAsset, metadataAsset);
    await repository.putMapAsset('base', manifest.baseSvgHash, baseAsset);
    await repository.putMapAsset('metadata', manifest.metadataHash, metadataAsset);
    return { manifest, baseAsset, metadataAsset, svg, cacheDecision: 'full_fallback' };
  }
}

export async function archiveResolvedRoomMap(repository, resolved, mapDefinition, mapValidation, roomCode) {
  const metadata = resolved.metadataAsset.metadata;
  return repository.savePreparedMap({
    mapId: metadata.mapId,
    displayName: metadata.displayName,
    revision: metadata.revision,
    baseSvgHash: resolved.manifest.baseSvgHash,
    metadataHash: resolved.manifest.metadataHash,
    baseSvg: resolved.baseAsset.svg,
    sanitizedSvg: resolved.svg,
    preparedSvg: embedMapMetadata(resolved.svg, metadata),
    thumbnail: resolved.svg,
    compactMetadata: metadata,
    mapDefinition,
    validation: mapValidation,
    sourceLabel: `Oda ${roomCode}`,
    updatedAt: Date.now(),
  });
}
