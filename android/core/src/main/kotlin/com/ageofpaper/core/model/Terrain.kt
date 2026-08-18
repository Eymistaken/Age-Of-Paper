package com.ageofpaper.core.model

/** Terrain vocabulary shared with `src/game/terrainModel.js`. */
object TerrainTypes {
    const val LAND = "land"
    const val OCEAN = "ocean"
    const val LAKE = "lake"
    const val IGNORED = "ignored"

    val ALL = listOf(LAND, OCEAN, LAKE, IGNORED)
    val SET = ALL.toSet()

    fun orIgnored(value: String?): String = if (value != null && SET.contains(value)) value else IGNORED
}

object ClassificationSources {
    const val AUTOMATIC = "automatic"
    const val METADATA = "metadata"
    const val HOST_OVERRIDE = "host_override"
}

object CoastTypes {
    const val NONE = "none"
    const val OCEAN = "ocean"
    const val LAKE = "lake"
    const val BOTH = "both"
}

data class AutomaticClassification(
    val terrainType: String = TerrainTypes.IGNORED,
    val confidence: Double = 0.0,
    val evidence: List<String> = emptyList(),
)

/** Compact row-run encoding for synthetic water components. */
data class GridRuns(
    val columns: Int,
    val rows: Int,
    val runs: List<IntRange>,
) {
    fun cells(): List<Int> = runs.flatMap { it.toList() }
}

data class Surface(
    val id: String,
    val elementId: String? = null,
    val sourceElementId: String? = null,
    val name: String = id,
    val automatic: AutomaticClassification = AutomaticClassification(),
    val metadataTerrainType: String? = null,
    val hostOverride: String? = null,
    val portPreference: Boolean? = null,
    val bounds: Bounds? = null,
    val boundary: Boundary = emptyList(),
    val area: Double? = null,
    val touchesRootBoundary: Boolean = false,
    val adjacentSurfaceIds: List<String> = emptyList(),
    val claimNeighborIds: List<String>? = null,
    val landNeighborIds: List<String>? = null,
    val seaNeighborIds: List<String> = emptyList(),
    val price: Long? = null,
    val income: Long? = null,
    val synthetic: Boolean = false,
    val geometry: GridRuns? = null,
    // Derived by TerrainModel.derive
    val terrainType: String = TerrainTypes.IGNORED,
    val classificationSource: String = ClassificationSources.AUTOMATIC,
    val confidence: Double = 0.0,
    val coastType: String = CoastTypes.NONE,
    val portAllowed: Boolean = false,
) {
    /** Grid cells owned by this synthetic component; empty for drawn surfaces. */
    val gridCells: List<Int> get() = geometry?.cells().orEmpty()
}

data class TerrainSummary(
    val playableLandCount: Int = 0,
    val oceanCount: Int = 0,
    val lakeCount: Int = 0,
    val ignoredCount: Int = 0,
    val coastalLandCount: Int = 0,
    val portAllowedCount: Int = 0,
)

data class NavigationComponent(
    val id: String,
    val runs: List<IntRange>,
    val portalCell: Int,
)

data class NavigationCoast(val componentId: String, val cell: Int)

data class NavigationMask(
    val version: Int = 1,
    val viewBox: ViewBox,
    val columns: Int,
    val rows: Int,
    val components: List<NavigationComponent>,
    val coasts: Map<String, List<NavigationCoast>>,
)

data class TerrainDocument(
    val mapId: String = "",
    val displayName: String = "İsimsiz Harita",
    val revision: Int = 1,
    val sourceGeometryHash: String = "",
    val baseSvgHash: String = "",
    val viewBox: ViewBox? = null,
    val editorSchemaVersion: Int = 2,
    val metadataSchemaVersion: Int = 2,
    val analysisAlgorithmVersion: String = "terrain-grid-v2",
    val surfaces: List<Surface> = emptyList(),
    val navalPolicy: String = "all_coasts",
    val allowedRoutes: List<String> = emptyList(),
    val blockedRoutes: List<String> = emptyList(),
    val compatibilityRoutes: List<String> = emptyList(),
    val invalidatedCompatibilityRoutes: List<String> = emptyList(),
    val navigationMask: NavigationMask? = null,
    val importIssues: List<MapIssue> = emptyList(),
    val summary: TerrainSummary = TerrainSummary(),
) {
    val surfacesById: Map<String, Surface> by lazy(LazyThreadSafetyMode.NONE) { surfaces.associateBy { it.id } }
}
