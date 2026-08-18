package com.ageofpaper.core.svg

import com.ageofpaper.core.model.AutomaticClassification
import com.ageofpaper.core.model.Bounds
import com.ageofpaper.core.model.CoastTypes
import com.ageofpaper.core.model.GridRuns
import com.ageofpaper.core.model.MapIssue
import com.ageofpaper.core.model.Point
import com.ageofpaper.core.model.Surface
import com.ageofpaper.core.model.TerrainDocument
import com.ageofpaper.core.model.TerrainTypes
import com.ageofpaper.core.model.ViewBox
import com.ageofpaper.core.rules.JsCompat
import org.w3c.dom.Document
import org.w3c.dom.Element
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** Port of `src/game/terrainAnalysis.js` (`terrain-grid-v2`). */
object TerrainAnalysis {

    private val LAKE_WORDS = Regex("""(^|[\s_-])(lake|pond|reservoir)([\s_-]|$)""", RegexOption.IGNORE_CASE)
    private val OCEAN_WORDS = Regex("""(^|[\s_-])(water|sea|ocean)([\s_-]|$)""", RegexOption.IGNORE_CASE)
    private val IGNORE_WORDS = Regex(
        """(^|[\s_-])(decor|decoration|background|frame|border|label|legend)([\s_-]|$)""",
        RegexOption.IGNORE_CASE,
    )
    private val SHORT_HEX = Regex("""^#([0-9a-f]{3})$""", RegexOption.IGNORE_CASE)
    private val LONG_HEX = Regex("""^#([0-9a-f]{6})$""", RegexOption.IGNORE_CASE)
    private val RGB = Regex("""^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)""", RegexOption.IGNORE_CASE)

    data class SemanticSurface(
        val id: String,
        val className: String = "",
        val label: String = "",
        val fill: String = "",
        val explicitRegion: Boolean = false,
        val ignored: Boolean = false,
    )

    fun fillRgb(fill: String?): Triple<Int, Int, Int>? {
        val value = fill.orEmpty().trim()
        SHORT_HEX.find(value)?.let { match ->
            val digits = match.groupValues[1]
            return Triple(
                (digits[0].toString() + digits[0]).toInt(16),
                (digits[1].toString() + digits[1]).toInt(16),
                (digits[2].toString() + digits[2]).toInt(16),
            )
        }
        LONG_HEX.find(value)?.let { match ->
            val digits = match.groupValues[1]
            return Triple(
                digits.substring(0, 2).toInt(16),
                digits.substring(2, 4).toInt(16),
                digits.substring(4, 6).toInt(16),
            )
        }
        RGB.find(value)?.let { match ->
            return Triple(
                match.groupValues[1].toInt(),
                match.groupValues[2].toInt(),
                match.groupValues[3].toInt(),
            )
        }
        return null
    }

    fun classifyAutomaticSurface(surface: SemanticSurface): AutomaticClassification {
        val semantic = "${surface.id} ${surface.className} ${surface.label}"
        if (surface.ignored || IGNORE_WORDS.containsMatchIn(semantic)) {
            return AutomaticClassification(
                TerrainTypes.IGNORED,
                if (surface.ignored) 0.99 else 0.74,
                listOf("semantic_ignore"),
            )
        }
        if (LAKE_WORDS.containsMatchIn(semantic)) {
            return AutomaticClassification(TerrainTypes.LAKE, 0.88, listOf("semantic_lake"))
        }
        if (OCEAN_WORDS.containsMatchIn(semantic)) {
            return AutomaticClassification(TerrainTypes.OCEAN, 0.82, listOf("semantic_ocean"))
        }
        val rgb = fillRgb(surface.fill)
        if (rgb != null) {
            val (red, green, blue) = rgb
            if (blue > red * 1.18 && (blue + green) / 2.0 > red * 1.12) {
                val lightness = (maxOf(red, green, blue) + minOf(red, green, blue)) / 510.0
                return AutomaticClassification(
                    if (lightness > 0.48 || green > blue * 0.78) TerrainTypes.LAKE else TerrainTypes.OCEAN,
                    0.56,
                    listOf("fill_color"),
                )
            }
            if (maxOf(red, green, blue) - minOf(red, green, blue) < 16) {
                return AutomaticClassification(TerrainTypes.IGNORED, 0.38, listOf("neutral_fill"))
            }
        }
        return AutomaticClassification(
            TerrainTypes.LAND,
            if (surface.explicitRegion) 0.96 else 0.58,
            listOf(if (surface.explicitRegion) "explicit_region" else "default_shape"),
        )
    }

    data class GridSize(val columns: Int, val rows: Int)

    /** Aspect aware grid, independent of CSS size, device pixels and zoom. */
    fun gridDimensions(viewBox: ViewBox): GridSize {
        val ratio = max(0.1, min(10.0, viewBox.width / viewBox.height))
        return GridSize(
            columns = max(40, min(192, jsRound(112 * sqrt(ratio)))),
            rows = max(40, min(192, jsRound(112 / sqrt(ratio)))),
        )
    }

    private fun jsRound(value: Double): Int = floor(value + 0.5).toInt()

    /** FNV-1a over the component cells, matching the JavaScript `Math.imul` loop. */
    fun stableCellHash(cells: List<Int>): String {
        var hash = 2166136261.toInt()
        for (cell in cells) {
            hash = hash xor (cell + 1)
            hash *= 16777619
        }
        return hash.toUInt().toString(36).padStart(7, '0')
    }

    fun componentRuns(cells: List<Int>, columns: Int): List<IntRange> {
        val sorted = cells.sorted()
        val runs = mutableListOf<IntRange>()
        var start: Int? = null
        var previous: Int? = null
        for (cell in sorted) {
            val sameRow = previous != null && previous / columns == cell / columns
            if (start == null || previous == null || cell != previous + 1 || !sameRow) {
                if (start != null && previous != null) runs.add(start..previous)
                start = cell
            }
            previous = cell
        }
        if (start != null && previous != null) runs.add(start..previous)
        return runs
    }

    /**
     * Flood fills the cells no drawn surface owns. A component touching the grid
     * boundary starts as ocean; a fully enclosed one starts as a lake.
     */
    fun buildWaterComponents(
        columns: Int,
        rows: Int,
        owners: Array<String?>,
        viewBox: ViewBox,
    ): List<Surface> {
        val visited = BooleanArray(columns * rows)
        val components = mutableListOf<Surface>()
        val stepX = viewBox.width / columns
        val stepY = viewBox.height / rows

        for (seed in owners.indices) {
            if (owners[seed] != null || visited[seed]) continue
            val queue = ArrayDeque<Int>()
            queue.add(seed)
            val cells = mutableListOf<Int>()
            var reachesBoundary = false
            visited[seed] = true
            while (queue.isNotEmpty()) {
                val cell = queue.removeFirst()
                cells.add(cell)
                val column = cell % columns
                val row = cell / columns
                if (column == 0 || row == 0 || column == columns - 1 || row == rows - 1) reachesBoundary = true
                val neighbors = intArrayOf(
                    if (column > 0) cell - 1 else -1,
                    if (column < columns - 1) cell + 1 else -1,
                    if (row > 0) cell - columns else -1,
                    if (row < rows - 1) cell + columns else -1,
                )
                for (neighbor in neighbors) {
                    if (neighbor >= 0 && owners[neighbor] == null && !visited[neighbor]) {
                        visited[neighbor] = true
                        queue.add(neighbor)
                    }
                }
            }
            val columnsOf = cells.map { it % columns }
            val rowsOf = cells.map { it / columns }
            val id = "water_${stableCellHash(cells)}"
            components.add(
                Surface(
                    id = id,
                    elementId = null,
                    name = if (reachesBoundary) "Çıkarılan okyanus" else "Çıkarılan göl",
                    synthetic = true,
                    touchesRootBoundary = reachesBoundary,
                    automatic = AutomaticClassification(
                        terrainType = if (reachesBoundary) TerrainTypes.OCEAN else TerrainTypes.LAKE,
                        confidence = 0.78,
                        evidence = listOf("negative_space"),
                    ),
                    bounds = Bounds(
                        x = viewBox.x + columnsOf.min() * stepX,
                        y = viewBox.y + rowsOf.min() * stepY,
                        width = (columnsOf.max() - columnsOf.min() + 1) * stepX,
                        height = (rowsOf.max() - rowsOf.min() + 1) * stepY,
                    ),
                    area = cells.size * stepX * stepY,
                    geometry = GridRuns(columns, rows, componentRuns(cells, columns)),
                ),
            )
        }
        return components.sortedWith { a, b -> JsCompat.localeCompare(a.id, b.id) }
    }

    /** Builds the navigation mask used for deterministic ship presentation. */
    fun buildNavigationMask(document: TerrainDocument): com.ageofpaper.core.model.NavigationMask? {
        val viewBox = document.viewBox ?: return null
        val synthetic = document.surfaces.firstOrNull { it.synthetic && it.geometry != null }?.geometry
        val columns = synthetic?.columns ?: gridDimensions(viewBox).columns
        val rows = synthetic?.rows ?: gridDimensions(viewBox).rows
        val size = columns * rows
        val stepX = viewBox.width / columns
        val stepY = viewBox.height / rows
        val passable = BooleanArray(size)
        val landOwner = arrayOfNulls<String>(size)
        val explicit = document.surfaces.filter { !it.synthetic }

        for (surface in document.surfaces) {
            if (!surface.synthetic) continue
            if (surface.terrainType != TerrainTypes.OCEAN && surface.terrainType != TerrainTypes.LAKE) continue
            for (cell in surface.gridCells) if (cell in 0 until size) passable[cell] = true
        }

        for (cell in 0 until size) {
            val column = cell % columns
            val row = cell / columns
            val point = Point(viewBox.x + (column + 0.5) * stepX, viewBox.y + (row + 0.5) * stepY)
            val containing = explicit.firstOrNull { pointInSurface(point, it) } ?: continue
            if (containing.terrainType == TerrainTypes.OCEAN || containing.terrainType == TerrainTypes.LAKE) {
                passable[cell] = true
            } else {
                passable[cell] = false
                if (containing.terrainType == TerrainTypes.LAND) landOwner[cell] = containing.id
            }
        }

        val componentByCell = arrayOfNulls<String>(size)
        val components = mutableListOf<com.ageofpaper.core.model.NavigationComponent>()
        val pending = arrayOfNulls<Boolean>(size)
        for (seed in 0 until size) {
            if (!passable[seed] || pending[seed] == true) continue
            val queue = ArrayDeque<Int>()
            queue.add(seed)
            pending[seed] = true
            val cells = mutableListOf<Int>()
            while (queue.isNotEmpty()) {
                val cell = queue.removeFirst()
                cells.add(cell)
                for (neighbor in cardinalNeighbors(cell, columns, rows)) {
                    if (passable[neighbor] && pending[neighbor] != true) {
                        pending[neighbor] = true
                        queue.add(neighbor)
                    }
                }
            }
            cells.sort()
            val id = "nav_${stableCellHash(cells)}"
            cells.forEach { componentByCell[it] = id }
            val boundaryCells = cells.filter { cell ->
                val column = cell % columns
                val row = cell / columns
                column == 0 || row == 0 || column == columns - 1 || row == rows - 1
            }
            components.add(
                com.ageofpaper.core.model.NavigationComponent(
                    id = id,
                    runs = componentRuns(cells, columns),
                    portalCell = (if (boundaryCells.isNotEmpty()) boundaryCells else cells).first(),
                ),
            )
        }
        components.sortWith { a, b -> JsCompat.localeCompare(a.id, b.id) }

        val coastCandidates = mutableMapOf<String, MutableMap<String, Int>>()
        for (cell in 0 until size) {
            val landId = landOwner[cell] ?: continue
            for (neighbor in cardinalNeighbors(cell, columns, rows)) {
                val componentId = componentByCell[neighbor] ?: continue
                val candidates = coastCandidates.getOrPut(landId) { mutableMapOf() }
                candidates[componentId] = min(candidates[componentId] ?: neighbor, neighbor)
            }
        }
        val coasts = coastCandidates.mapValues { (_, candidates) ->
            candidates.entries
                .sortedWith { a, b -> JsCompat.localeCompare(a.key, b.key) }
                .map { com.ageofpaper.core.model.NavigationCoast(it.key, it.value) }
        }

        return com.ageofpaper.core.model.NavigationMask(
            version = 1,
            viewBox = viewBox,
            columns = columns,
            rows = rows,
            components = components,
            coasts = coasts,
        )
    }

    private fun pointInSurface(point: Point, surface: Surface): Boolean {
        val lines = surface.boundary.filter { it.size > 2 }
        if (lines.isNotEmpty()) {
            var inside = false
            for (line in lines) if (SvgGeometry.pointInLine(point, line)) inside = !inside
            return inside
        }
        val bounds = surface.bounds ?: return false
        return point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
            point.y >= bounds.y && point.y <= bounds.y + bounds.height
    }

    private fun cardinalNeighbors(cell: Int, columns: Int, rows: Int): List<Int> {
        val column = cell % columns
        val row = cell / columns
        return listOfNotNull(
            if (column > 0) cell - 1 else null,
            if (column < columns - 1) cell + 1 else null,
            if (row > 0) cell - columns else null,
            if (row < rows - 1) cell + columns else null,
        )
    }

    data class AnalysisResult(val document: TerrainDocument, val sanitizedSvg: String)

    fun analyze(svgText: String): AnalysisResult {
        val document: Document = SvgSanitizer.parseSanitized(svgText)
        val svg: Element = document.documentElement
        val viewBox = SvgSanitizer.parseViewBox(svg)
        val extracted = SurfaceCandidates.extract(svg, viewBox)
        val importIssues = extracted.importIssues.toMutableList()

        val sourceToId = extracted.sourceToId
        fun resolveIds(values: List<String>?): List<String>? = values?.let { list ->
            JsCompat.uniqueSorted(list.map { sourceToId[it] ?: SurfaceCandidates.normalizeRegionId(it) })
        }

        val boundaryTolerance = hypot(viewBox.width, viewBox.height) * 0.002
        val surfaces = extracted.records.map { record ->
            val element = record.element
            element.setAttribute("data-surface-id", record.id)
            element.setAttribute("data-region-id", record.id)

            val explicitTerrain = element.attr("data-terrain")
            val metadataTerrainType = explicitTerrain?.takeIf { TerrainTypes.SET.contains(it) }
            if (explicitTerrain != null && metadataTerrainType == null) {
                importIssues.add(
                    MapIssue(
                        "INVALID_TERRAIN",
                        "“${record.sourceId}” için data-terrain değeri geçersiz.",
                        severity = "error",
                    ),
                )
            }
            if (element.attr("data-port-allowed") != null &&
                SvgSanitizer.booleanAttribute(element.attr("data-port-allowed")) == null
            ) {
                importIssues.add(
                    MapIssue(
                        "INVALID_PORT_ALLOWED",
                        "“${record.sourceId}” için data-port-allowed true veya false olmalı.",
                        severity = "error",
                    ),
                )
            }
            val explicitPrice = element.attr("data-price")
            if (explicitPrice != null && SvgSanitizer.parseNumber(explicitPrice) == null) {
                importIssues.add(
                    MapIssue(
                        "INVALID_NUMBER",
                        "“${record.sourceId}” için data-price geçerli bir sayı değil.",
                        severity = "error",
                    ),
                )
            }
            val explicitIncome = element.attr("data-income")
            if (explicitIncome != null && SvgSanitizer.parseNumber(explicitIncome) == null) {
                importIssues.add(
                    MapIssue(
                        "INVALID_NUMBER",
                        "“${record.sourceId}” için data-income geçerli bir sayı değil.",
                        severity = "error",
                    ),
                )
            }

            val commonNeighbors = element.attr("data-neighbors")
            val claimNeighbors = element.attr("data-claim-neighbors") ?: commonNeighbors
            val landNeighbors = element.attr("data-land-neighbors") ?: commonNeighbors
            val bounds = extracted.boundsById[record.id]

            Surface(
                id = record.id,
                elementId = record.id,
                sourceElementId = record.sourceId,
                name = element.attr("data-name")
                    ?: element.attr("aria-label")
                    ?: record.sourceId.replace(Regex("""[_-]+"""), " "),
                automatic = classifyAutomaticSurface(
                    SemanticSurface(
                        id = record.id,
                        className = element.attrOrEmpty("class"),
                        label = element.attr("aria-label") ?: element.attr("data-name") ?: "",
                        fill = element.attrOrEmpty("fill"),
                        explicitRegion = element.attr("data-region") == "true",
                        ignored = element.attr("data-ignore") == "true",
                    ),
                ),
                metadataTerrainType = metadataTerrainType,
                hostOverride = null,
                portPreference = SvgSanitizer.booleanAttribute(element.attr("data-port-allowed")),
                bounds = bounds,
                boundary = extracted.boundariesById[record.id].orEmpty(),
                area = bounds?.let { it.width * it.height },
                touchesRootBoundary = bounds != null && (
                    bounds.x <= viewBox.x + boundaryTolerance ||
                        bounds.y <= viewBox.y + boundaryTolerance ||
                        bounds.x + bounds.width >= viewBox.x + viewBox.width - boundaryTolerance ||
                        bounds.y + bounds.height >= viewBox.y + viewBox.height - boundaryTolerance
                    ),
                claimNeighborIds = resolveIds(SvgSanitizer.splitIds(claimNeighbors)),
                landNeighborIds = resolveIds(SvgSanitizer.splitIds(landNeighbors)),
                seaNeighborIds = resolveIds(SvgSanitizer.splitIds(element.attr("data-sea-neighbors"))).orEmpty(),
                price = SvgSanitizer.parseNumber(explicitPrice)?.toLong(),
                income = SvgSanitizer.parseNumber(explicitIncome)?.toLong(),
            )
        }

        val preliminary = TerrainModel.derive(TerrainDocument(viewBox = viewBox, surfaces = surfaces))
        val (columns, rows) = gridDimensions(viewBox)
        val owners = arrayOfNulls<String>(columns * rows)
        val stepX = viewBox.width / columns
        val stepY = viewBox.height / rows
        for (row in 0 until rows) {
            for (column in 0 until columns) {
                val point = Point(viewBox.x + (column + 0.5) * stepX, viewBox.y + (row + 0.5) * stepY)
                val containing = preliminary.surfaces.firstOrNull {
                    SvgGeometry.pointInBoundary(point, it.boundary)
                } ?: continue
                owners[row * columns + column] = when (containing.terrainType) {
                    TerrainTypes.LAND -> containing.id
                    TerrainTypes.OCEAN, TerrainTypes.LAKE -> "@" + containing.id
                    else -> null
                }
            }
        }

        val waterComponents = buildWaterComponents(columns, rows, owners, viewBox)
        val adjacency = SvgAdjacency.inferBoundaryAdjacency(
            surfaces.map { it.id },
            extracted.boundariesById,
            extracted.boundsById,
            viewBox,
        )

        val componentByCell = mutableMapOf<Int, String>()
        waterComponents.forEach { component ->
            component.gridCells.forEach { componentByCell[it] = component.id }
        }
        for (cell in owners.indices) {
            val componentId = componentByCell[cell] ?: continue
            for (neighborCell in cardinalNeighbors(cell, columns, rows)) {
                val owner = owners[neighborCell] ?: continue
                if (owner.startsWith("@")) continue
                adjacency[owner]?.add(componentId)
                adjacency.getOrPut(componentId) { mutableSetOf() }.add(owner)
            }
        }

        val allSurfaces = (surfaces + waterComponents).map { surface ->
            surface.copy(adjacentSurfaceIds = JsCompat.uniqueSorted(adjacency[surface.id].orEmpty()))
        }

        val analysisIssues = importIssues + if (extracted.unmeasuredBoundaryIds.isNotEmpty()) {
            listOf(
                MapIssue(
                    "ANALYSIS_GEOMETRY_INCOMPLETE",
                    "${extracted.unmeasuredBoundaryIds.size} yüzeyin sınırı güvenilir biçimde ölçülemedi.",
                    severity = "warning",
                ),
            )
        } else {
            emptyList()
        }

        var result = TerrainModel.derive(
            TerrainDocument(
                viewBox = viewBox,
                surfaces = allSurfaces,
                compatibilityRoutes = surfaces.flatMap { surface ->
                    surface.seaNeighborIds.mapNotNull {
                        com.ageofpaper.core.rules.NavalPolicy.routeKey(surface.id, it).takeIf(String::isNotEmpty)
                    }
                },
                analysisAlgorithmVersion = TerrainModel.ANALYSIS_ALGORITHM_VERSION,
                importIssues = analysisIssues,
            ),
        )
        result = result.copy(navigationMask = buildNavigationMask(result))
        return AnalysisResult(result, SvgDom.serialize(svg))
    }

    /** Convenience for callers that only need coastal counts. */
    fun coastalLandIds(document: TerrainDocument): List<String> =
        document.surfaces.filter { it.terrainType == TerrainTypes.LAND && it.coastType != CoastTypes.NONE }
            .map { it.id }
}
