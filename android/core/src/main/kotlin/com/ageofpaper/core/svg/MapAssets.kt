package com.ageofpaper.core.svg

import com.ageofpaper.core.json.Json
import com.ageofpaper.core.json.JsonValue
import com.ageofpaper.core.json.asInt
import com.ageofpaper.core.json.asObject
import com.ageofpaper.core.json.asString

/**
 * Port of `src/services/mapAssetService.js`.
 *
 * A room document only stores a small manifest; the base artwork and the
 * compact metadata live in the `mapAssets` subcollection because a Firestore
 * document cannot hold a full map. Both assets are content addressed, so a
 * client can cache them and verify them by hash before rendering.
 */
object MapAssets {

    const val MAP_MANIFEST_VERSION = 1
    private const val MAX_BASE_SVG_CHARACTERS = 650_000
    private const val MAX_METADATA_CHARACTERS = 450_000

    data class Manifest(
        val version: Int = MAP_MANIFEST_VERSION,
        val mapId: String,
        val displayName: String,
        val revision: Int,
        val baseSvgHash: String,
        val metadataHash: String,
        val metadataSchemaVersion: Int,
        val analysisAlgorithmVersion: String,
        val mapDefinitionVersion: Int,
    ) {
        val valid: Boolean
            get() = version == MAP_MANIFEST_VERSION &&
                mapId.isNotEmpty() &&
                revision >= 1 &&
                baseSvgHash.isNotEmpty() &&
                metadataHash.isNotEmpty()
    }

    data class BaseAsset(
        val kind: String = "base_svg",
        val schemaVersion: Int = 1,
        val hash: String,
        val svg: String,
        val size: Int,
    )

    data class MetadataAsset(
        val kind: String = "metadata",
        val schemaVersion: Int,
        val hash: String,
        val mapId: String,
        val revision: Int,
        val metadata: String,
        val size: Int,
    )

    data class RoomMapAssets(
        val manifest: Manifest,
        val baseAsset: BaseAsset,
        val metadataAsset: MetadataAsset,
    )

    fun build(prepared: MapImporter.PreparedMap): RoomMapAssets {
        val baseSvg = SvgSanitizer.sanitizeMarkup(prepared.baseSvg)
        if (baseSvg.isEmpty() || baseSvg.length > MAX_BASE_SVG_CHARACTERS) {
            throw IllegalArgumentException("Temel SVG room asset sınırını aşıyor.")
        }
        val baseSvgHash = MapMetadata.hashText(baseSvg)
        if (prepared.baseSvgHash.isNotEmpty() && prepared.baseSvgHash != baseSvgHash) {
            throw IllegalArgumentException("Temel SVG hash doğrulaması başarısız.")
        }
        val metadata = prepared.compactMetadata
        val validation = MapMetadata.validatePackage(metadata)
        if (!validation.valid) throw IllegalArgumentException(validation.errors.first().message)
        val metadataJson = MapMetadata.canonicalJson(metadata)
        val metadataHash = MapMetadata.hashText(metadataJson)
        if (metadataJson.length > MAX_METADATA_CHARACTERS) {
            throw IllegalArgumentException("Kompakt metadata room asset sınırını aşıyor.")
        }
        if (prepared.metadataHash.isNotEmpty() && prepared.metadataHash != metadataHash) {
            throw IllegalArgumentException("Kompakt metadata hash doğrulaması başarısız.")
        }
        val root = metadata.asObject.orEmpty()
        return RoomMapAssets(
            manifest = Manifest(
                mapId = prepared.mapId,
                displayName = prepared.displayName,
                revision = prepared.revision,
                baseSvgHash = baseSvgHash,
                metadataHash = metadataHash,
                metadataSchemaVersion = root["schemaVersion"]?.asInt ?: TerrainModel.METADATA_SCHEMA_VERSION,
                analysisAlgorithmVersion = root["analysisAlgorithmVersion"]?.asString
                    ?: TerrainModel.ANALYSIS_ALGORITHM_VERSION,
                mapDefinitionVersion = prepared.mapDefinition.version,
            ),
            baseAsset = BaseAsset(hash = baseSvgHash, svg = baseSvg, size = baseSvg.length),
            metadataAsset = MetadataAsset(
                schemaVersion = root["schemaVersion"]?.asInt ?: TerrainModel.METADATA_SCHEMA_VERSION,
                hash = metadataHash,
                mapId = prepared.mapId,
                revision = prepared.revision,
                metadata = metadataJson,
                size = metadataJson.length,
            ),
        )
    }

    data class ResolvedMap(val svg: String, val metadata: JsonValue)

    /** Verifies both assets against the manifest, then recomposes the playable SVG. */
    fun verify(manifest: Manifest, baseAsset: BaseAsset?, metadataAsset: MetadataAsset?): ResolvedMap {
        if (baseAsset == null || metadataAsset == null) {
            throw IllegalArgumentException("Harita asset kimliği manifest ile eşleşmiyor.")
        }
        if (baseAsset.kind != "base_svg" || baseAsset.hash != manifest.baseSvgHash ||
            metadataAsset.kind != "metadata" || metadataAsset.hash != manifest.metadataHash
        ) {
            throw IllegalArgumentException("Harita asset kimliği manifest ile eşleşmiyor.")
        }
        if (MapMetadata.hashText(baseAsset.svg) != manifest.baseSvgHash) {
            throw IllegalArgumentException("Temel SVG asset hash değeri uyuşmuyor.")
        }
        val metadata = try {
            Json.parse(metadataAsset.metadata)
        } catch (error: IllegalArgumentException) {
            throw IllegalArgumentException("Metadata asset JSON kaydı okunamadı.")
        }
        if (MapMetadata.hashText(MapMetadata.canonicalJson(metadata)) != manifest.metadataHash) {
            throw IllegalArgumentException("Metadata asset hash değeri uyuşmuyor.")
        }
        if (metadataAsset.mapId != manifest.mapId || metadataAsset.revision != manifest.revision) {
            throw IllegalArgumentException("Metadata revision veya mapId değeri uyuşmuyor.")
        }
        val validation = MapMetadata.validatePackage(metadata)
        if (!validation.valid) throw IllegalArgumentException(validation.errors.first().message)
        return ResolvedMap(MapMetadata.applyCompactMetadataToSvg(baseAsset.svg, metadata), metadata)
    }
}
