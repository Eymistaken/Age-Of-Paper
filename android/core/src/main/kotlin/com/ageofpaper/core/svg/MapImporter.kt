package com.ageofpaper.core.svg

import com.ageofpaper.core.json.JsonValue
import com.ageofpaper.core.json.asBoolean
import com.ageofpaper.core.json.asObject
import com.ageofpaper.core.model.MapDefinition
import com.ageofpaper.core.model.Surface
import com.ageofpaper.core.model.TerrainDocument
import com.ageofpaper.core.model.ValidationResult
import com.ageofpaper.core.rules.MapValidation
import kotlin.random.Random

/**
 * Port of `prepareSvgMap` / `rebuildPreparedMap` in `src/game/mapImporter.js`.
 *
 * A file that already carries valid Age of Paper metadata whose
 * `sourceGeometryHash` matches the artwork is not re-analysed; compact metadata
 * triggers a fresh analysis whose surfaces are then overwritten with the stored
 * host decisions.
 */
object MapImporter {

    class MapMetadataConflictException(
        message: String,
        val code: String,
        val expected: String,
        val actual: String,
    ) : IllegalStateException(message)

    enum class MetadataMismatch { FAIL, REANALYZE }

    data class PreparedMap(
        val mapId: String,
        val displayName: String,
        val revision: Int,
        val originalSvg: String,
        val baseSvg: String,
        val preparedSvg: String,
        val sanitizedSvg: String,
        val mapDefinition: MapDefinition,
        val validation: ValidationResult,
        val terrainDocument: TerrainDocument,
        val fullMetadata: JsonValue,
        val compactMetadata: JsonValue,
        val baseSvgHash: String,
        val metadataHash: String,
        val metadataStatus: String,
        val createdAt: Long,
        val updatedAt: Long,
        val sourceLabel: String,
    )

    fun newMapId(random: Random = Random.Default): String =
        "map_" + (1..12).map { ALPHABET[random.nextInt(ALPHABET.length)] }.joinToString("")

    private const val ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

    fun prepare(
        svgText: String,
        displayName: String? = null,
        mapId: String? = null,
        sourceLabel: String = "Dosya içe aktarımı",
        metadataMismatch: MetadataMismatch = MetadataMismatch.FAIL,
        forceReanalysis: Boolean = false,
        now: Long = System.currentTimeMillis(),
        random: Random = Random.Default,
    ): PreparedMap {
        val originalSvg = svgText
        val sanitizedOriginal = SvgSanitizer.sanitizeMarkup(svgText)
        val extracted = MapMetadata.extract(sanitizedOriginal)
        val baseSvg = MapMetadata.stripEditorMetadata(sanitizedOriginal)
        val baseSvgHash = MapMetadata.hashText(baseSvg)

        var terrainDocument: TerrainDocument? = null
        var metadataStatus = when {
            forceReanalysis -> "forced_reanalysis"
            extracted.found -> "invalid"
            else -> "absent"
        }

        if (!forceReanalysis && extracted.found && extracted.valid && extracted.metadata != null) {
            val stored = MapMetadata.toTerrainDocument(extracted.metadata)
            if (stored.sourceGeometryHash != baseSvgHash) {
                if (metadataMismatch == MetadataMismatch.REANALYZE) {
                    metadataStatus = "geometry_mismatch_reanalyzed"
                } else {
                    throw MapMetadataConflictException(
                        "Age of Paper metadata kaydı SVG geometrisiyle eşleşmiyor.",
                        "SOURCE_GEOMETRY_MISMATCH",
                        stored.sourceGeometryHash,
                        baseSvgHash,
                    )
                }
            } else {
                val compact = isCompact(extracted.metadata)
                terrainDocument = if (compact) {
                    val regenerated = TerrainAnalysis.analyze(baseSvg).document
                    val importedById = stored.surfaces.associateBy { it.id }
                    TerrainModel.derive(
                        regenerated.copy(
                            mapId = stored.mapId,
                            displayName = stored.displayName,
                            revision = stored.revision,
                            sourceGeometryHash = baseSvgHash,
                            baseSvgHash = baseSvgHash,
                            analysisAlgorithmVersion = stored.analysisAlgorithmVersion,
                            compatibilityRoutes = stored.compatibilityRoutes,
                            navalPolicy = stored.navalPolicy,
                            allowedRoutes = stored.allowedRoutes,
                            blockedRoutes = stored.blockedRoutes,
                            navigationMask = stored.navigationMask,
                            importIssues = stored.importIssues,
                            surfaces = regenerated.surfaces.map { surface ->
                                mergeStoredSurface(surface, importedById[surface.id])
                            },
                        ),
                    )
                } else {
                    TerrainModel.derive(
                        stored.copy(
                            sourceGeometryHash = baseSvgHash,
                            baseSvgHash = baseSvgHash,
                        ),
                    )
                }
                metadataStatus = "validated"
            }
        }

        if (terrainDocument == null) {
            val analyzed = TerrainAnalysis.analyze(sanitizedOriginal).document
            terrainDocument = TerrainModel.derive(
                analyzed.copy(
                    mapId = mapId ?: newMapId(random),
                    displayName = (displayName ?: "İsimsiz Harita").trim().take(120).ifBlank { "İsimsiz Harita" },
                    revision = 1,
                    sourceGeometryHash = baseSvgHash,
                    baseSvgHash = baseSvgHash,
                ),
            )
        }

        var mapDefinition = TerrainModel.buildMapDefinition(terrainDocument)
        val pricedById = mapDefinition.regionsById
        terrainDocument = TerrainModel.derive(
            terrainDocument.copy(
                baseSvgHash = baseSvgHash,
                sourceGeometryHash = baseSvgHash,
                surfaces = terrainDocument.surfaces.map { surface ->
                    val priced = pricedById[surface.id]
                    if (priced == null) surface else surface.copy(price = priced.price, income = priced.income)
                },
            ),
        )
        mapDefinition = TerrainModel.buildMapDefinition(terrainDocument)
        val validation = MapValidation.validate(mapDefinition)

        val fullMetadata = MapMetadata.createPackage(terrainDocument, compact = false)
        val compactMetadata = MapMetadata.createPackage(terrainDocument, compact = true)
        val metadataHash = MapMetadata.hashText(MapMetadata.canonicalJson(compactMetadata))
        val composedSvg = MapMetadata.applyCompactMetadataToSvg(baseSvg, compactMetadata)
        val preparedSvg = MapMetadata.embedMetadata(composedSvg, compactMetadata)

        return PreparedMap(
            mapId = terrainDocument.mapId,
            displayName = terrainDocument.displayName,
            revision = terrainDocument.revision,
            originalSvg = originalSvg,
            baseSvg = baseSvg,
            preparedSvg = preparedSvg,
            sanitizedSvg = composedSvg,
            mapDefinition = mapDefinition,
            validation = validation,
            terrainDocument = terrainDocument,
            fullMetadata = fullMetadata,
            compactMetadata = compactMetadata,
            baseSvgHash = baseSvgHash,
            metadataHash = metadataHash,
            metadataStatus = metadataStatus,
            createdAt = now,
            updatedAt = now,
            sourceLabel = sourceLabel,
        )
    }

    /** Re-applies host decisions after an edit without touching the artwork. */
    fun rebuild(prepared: PreparedMap, nextTerrainDocument: TerrainDocument, now: Long = System.currentTimeMillis()): PreparedMap {
        val derived = TerrainModel.derive(
            nextTerrainDocument.copy(
                mapId = prepared.mapId,
                baseSvgHash = prepared.baseSvgHash,
                sourceGeometryHash = prepared.baseSvgHash,
            ),
        )
        var mapDefinition = TerrainModel.buildMapDefinition(derived)
        val pricedById = mapDefinition.regionsById
        val repriced = TerrainModel.derive(
            derived.copy(
                surfaces = derived.surfaces.map { surface ->
                    val priced = pricedById[surface.id]
                    if (priced == null) surface else surface.copy(price = priced.price, income = priced.income)
                },
            ),
        )
        mapDefinition = TerrainModel.buildMapDefinition(repriced)
        val validation = MapValidation.validate(mapDefinition)
        val fullMetadata = MapMetadata.createPackage(repriced, compact = false)
        val compactMetadata = MapMetadata.createPackage(repriced, compact = true)
        val metadataHash = MapMetadata.hashText(MapMetadata.canonicalJson(compactMetadata))
        val composedSvg = MapMetadata.applyCompactMetadataToSvg(prepared.baseSvg, compactMetadata)
        val preparedSvg = MapMetadata.embedMetadata(composedSvg, compactMetadata)

        return prepared.copy(
            displayName = repriced.displayName,
            revision = repriced.revision,
            preparedSvg = preparedSvg,
            sanitizedSvg = composedSvg,
            mapDefinition = mapDefinition,
            validation = validation,
            terrainDocument = repriced,
            fullMetadata = fullMetadata,
            compactMetadata = compactMetadata,
            metadataHash = metadataHash,
            updatedAt = now,
        )
    }

    private fun mergeStoredSurface(surface: Surface, stored: Surface?): Surface =
        if (stored == null) {
            surface
        } else {
            surface.copy(
                name = stored.name,
                metadataTerrainType = stored.metadataTerrainType,
                hostOverride = stored.hostOverride,
                portPreference = stored.portPreference,
                claimNeighborIds = stored.claimNeighborIds,
                landNeighborIds = stored.landNeighborIds,
                price = stored.price,
                income = stored.income,
            )
        }

    private fun isCompact(metadata: JsonValue): Boolean =
        metadata.asObject?.get("compact")?.asBoolean == true
}
