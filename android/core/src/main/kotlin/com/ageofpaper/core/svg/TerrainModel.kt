package com.ageofpaper.core.svg

import com.ageofpaper.core.model.AutomaticClassification
import com.ageofpaper.core.model.ClassificationSources
import com.ageofpaper.core.model.CoastTypes
import com.ageofpaper.core.model.MapDefinition
import com.ageofpaper.core.model.Region
import com.ageofpaper.core.model.Surface
import com.ageofpaper.core.model.TerrainDocument
import com.ageofpaper.core.model.TerrainSummary
import com.ageofpaper.core.model.TerrainTypes
import com.ageofpaper.core.rules.JsCompat
import com.ageofpaper.core.rules.NavalPolicy
import com.ageofpaper.core.rules.Pricing

/** Port of `src/game/terrainModel.js`. */
object TerrainModel {

    const val EDITOR_SCHEMA_VERSION = 2
    const val METADATA_SCHEMA_VERSION = 2
    const val ANALYSIS_ALGORITHM_VERSION = "terrain-grid-v2"

    private fun clampConfidence(value: Double?): Double =
        (value ?: 0.0).takeIf { it.isFinite() }?.coerceIn(0.0, 1.0) ?: 0.0

    /** `hostOverride` beats metadata, metadata beats the automatic guess. */
    private fun effectiveClassification(surface: Surface): Pair<String, String> {
        if (surface.hostOverride != null && TerrainTypes.SET.contains(surface.hostOverride)) {
            return surface.hostOverride to ClassificationSources.HOST_OVERRIDE
        }
        if (surface.metadataTerrainType != null && TerrainTypes.SET.contains(surface.metadataTerrainType)) {
            return surface.metadataTerrainType to ClassificationSources.METADATA
        }
        return TerrainTypes.orIgnored(surface.automatic.terrainType) to ClassificationSources.AUTOMATIC
    }

    fun normalizeSurface(surface: Surface, index: Int = 0): Surface {
        val id = surface.id.ifBlank { "surface_${index + 1}" }
        val (terrainType, classificationSource) = effectiveClassification(surface)
        return surface.copy(
            id = id,
            name = surface.name.ifBlank { id },
            automatic = AutomaticClassification(
                terrainType = TerrainTypes.orIgnored(surface.automatic.terrainType),
                confidence = clampConfidence(surface.automatic.confidence),
                evidence = surface.automatic.evidence,
            ),
            metadataTerrainType = surface.metadataTerrainType?.takeIf { TerrainTypes.SET.contains(it) },
            hostOverride = surface.hostOverride?.takeIf { TerrainTypes.SET.contains(it) },
            adjacentSurfaceIds = JsCompat.uniqueSorted(surface.adjacentSurfaceIds),
            terrainType = terrainType,
            classificationSource = classificationSource,
            confidence = clampConfidence(surface.automatic.confidence),
            coastType = CoastTypes.NONE,
            portAllowed = false,
        )
    }

    fun summarize(surfaces: List<Surface>): TerrainSummary = TerrainSummary(
        playableLandCount = surfaces.count { it.terrainType == TerrainTypes.LAND },
        oceanCount = surfaces.count { it.terrainType == TerrainTypes.OCEAN },
        lakeCount = surfaces.count { it.terrainType == TerrainTypes.LAKE },
        ignoredCount = surfaces.count { it.terrainType == TerrainTypes.IGNORED },
        coastalLandCount = surfaces.count {
            it.terrainType == TerrainTypes.LAND && it.coastType != CoastTypes.NONE
        },
        portAllowedCount = surfaces.count { it.portAllowed },
    )

    /**
     * Derives coasts, port permission and the naval route lists.
     * A land surface only becomes coastal through adjacency with final water.
     */
    fun derive(document: TerrainDocument): TerrainDocument {
        val normalized = document.surfaces.mapIndexed { index, surface -> normalizeSurface(surface, index) }
        val provisionalById = normalized.associateBy { it.id }
        val surfaces = normalized.map { surface ->
            if (surface.terrainType != TerrainTypes.LAND) return@map surface
            val waterTypes = surface.adjacentSurfaceIds
                .mapNotNull { provisionalById[it]?.terrainType }
                .filter { it == TerrainTypes.OCEAN || it == TerrainTypes.LAKE }
                .toSet()
            val coastType = when {
                waterTypes.size == 2 -> CoastTypes.BOTH
                waterTypes.contains(TerrainTypes.OCEAN) -> CoastTypes.OCEAN
                waterTypes.contains(TerrainTypes.LAKE) -> CoastTypes.LAKE
                else -> CoastTypes.NONE
            }
            surface.copy(
                coastType = coastType,
                portAllowed = coastType != CoastTypes.NONE && surface.portPreference != false,
            )
        }

        val surfaceRegions = surfaces.associate { it.id to it.asRegion() }
        val legacyRoutes = document.compatibilityRoutes
        val explicitPolicy = document.navalPolicy.takeIf { NavalPolicy.VALUES.contains(it) }
        val policy = explicitPolicy
            ?: if (legacyRoutes.isNotEmpty()) NavalPolicy.SELECTED_ROUTES else NavalPolicy.ALL_COASTS
        val allowedSource = document.allowedRoutes.ifEmpty { legacyRoutes }
        val allowed = NavalPolicy.normalizeRouteList(allowedSource, surfaceRegions)
        val blocked = NavalPolicy.normalizeRouteList(document.blockedRoutes, surfaceRegions)
        val invalidated = (allowed.invalidRoutes + blocked.invalidRoutes)
            .distinctBy { it.key }
            .sortedWith { a, b -> JsCompat.localeCompare(a.key, b.key) }

        return document.copy(
            editorSchemaVersion = EDITOR_SCHEMA_VERSION,
            metadataSchemaVersion = METADATA_SCHEMA_VERSION,
            analysisAlgorithmVersion = document.analysisAlgorithmVersion.ifBlank { ANALYSIS_ALGORITHM_VERSION },
            surfaces = surfaces,
            navalPolicy = policy,
            allowedRoutes = allowed.routes.map { it.key },
            blockedRoutes = blocked.routes.map { it.key },
            compatibilityRoutes = allowed.routes.map { it.key },
            invalidatedCompatibilityRoutes = invalidated.map { it.key },
            summary = summarize(surfaces),
        )
    }

    /** Surface projected into the shape the naval rules expect. */
    private fun Surface.asRegion(): Region = Region(
        id = id,
        name = name,
        price = price ?: 0L,
        income = income ?: 0L,
        bounds = bounds,
        coastal = coastType != CoastTypes.NONE,
        coastType = coastType,
        portAllowed = portAllowed,
        terrainType = terrainType,
    )

    /** Port of `buildCompatibilityMapDefinition`: only land surfaces are playable. */
    fun buildMapDefinition(document: TerrainDocument): MapDefinition {
        // derive is idempotent: it recomputes coasts and ports from adjacency.
        val derived = derive(document)
        val land = derived.surfaces.filter { it.terrainType == TerrainTypes.LAND }
        val landIds = land.map { it.id }.toSet()
        val priced = Pricing.applyAutomaticPricing(
            land.map { surface ->
                Pricing.PricingInput(
                    id = surface.id,
                    area = surface.area ?: surface.bounds?.let { it.width * it.height },
                    explicitPrice = surface.price,
                    explicitIncome = surface.income,
                )
            },
        ).records.associateBy { it.id }

        val routeNeighbors = mutableMapOf<String, MutableList<String>>()
        land.forEach { routeNeighbors[it.id] = mutableListOf() }
        if (derived.navalPolicy == NavalPolicy.SELECTED_ROUTES) {
            for (route in derived.allowedRoutes) {
                val pair = NavalPolicy.normalizeRoutePair(route) ?: continue
                routeNeighbors[pair.first]?.add(pair.second)
                routeNeighbors[pair.second]?.add(pair.first)
            }
        }

        val regions = land.map { surface ->
            val adjacentLand = JsCompat.uniqueSorted(surface.adjacentSurfaceIds.filter { landIds.contains(it) })
            val explicitClaim = surface.claimNeighborIds
                ?.let { JsCompat.uniqueSorted(it.filter { id -> landIds.contains(id) }) }
                ?: adjacentLand
            val explicitLand = surface.landNeighborIds
                ?.let { JsCompat.uniqueSorted(it.filter { id -> landIds.contains(id) }) }
                ?: adjacentLand
            val price = priced[surface.id]
            Region(
                id = surface.id,
                name = surface.name,
                price = price?.price ?: 0L,
                income = price?.income ?: 0L,
                bounds = surface.bounds,
                landNeighbors = explicitLand,
                claimNeighbors = explicitClaim,
                seaNeighbors = JsCompat.uniqueSorted(routeNeighbors[surface.id]),
                coastal = surface.coastType != CoastTypes.NONE,
                coastType = surface.coastType,
                portAllowed = surface.portAllowed,
            )
        }

        return MapDefinition(
            version = 1,
            pricingVersion = Pricing.PRICING_VERSION,
            geometryVersion = 2,
            boundsSpace = "viewBox",
            terrainSchemaVersion = METADATA_SCHEMA_VERSION,
            analysisAlgorithmVersion = derived.analysisAlgorithmVersion,
            navalPolicy = derived.navalPolicy,
            allowedRoutes = derived.allowedRoutes,
            blockedRoutes = derived.blockedRoutes,
            viewBox = derived.viewBox,
            regions = regions,
            pricingSummary = Pricing.summarize(regions.map { it.price }, regions.map { it.income }),
            importIssues = derived.importIssues,
        )
    }
}
