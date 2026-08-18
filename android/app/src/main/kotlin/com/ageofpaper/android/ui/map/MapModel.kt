package com.ageofpaper.android.ui.map

import androidx.compose.ui.graphics.Path
import com.ageofpaper.core.model.Boundary
import com.ageofpaper.core.model.Bounds
import com.ageofpaper.core.model.MapDefinition
import com.ageofpaper.core.model.Point
import com.ageofpaper.core.model.ViewBox
import com.ageofpaper.core.svg.SvgGeometry
import com.ageofpaper.core.svg.SvgSanitizer
import com.ageofpaper.core.svg.SvgTransform
import com.ageofpaper.core.svg.attr
import com.ageofpaper.core.svg.selfAndDescendants
import com.ageofpaper.core.svg.tag

/**
 * A drawable region in root viewBox coordinates.
 *
 * AGENTS.md makes the root `viewBox` the only world coordinate system, so the
 * geometry is converted once here and every later step (drawing, hit testing,
 * badges, route lines) works in that space.
 */
data class MapShape(
    val regionId: String,
    val path: Path,
    val boundary: Boundary,
    val bounds: Bounds,
) {
    val centerX: Double get() = bounds.x + bounds.width / 2
    val centerY: Double get() = bounds.y + bounds.height / 2
}

data class RenderableMap(
    val viewBox: ViewBox,
    val shapes: List<MapShape>,
) {
    val shapesById: Map<String, MapShape> = shapes.associateBy { it.regionId }

    fun regionAt(x: Double, y: Double): String? {
        val point = Point(x, y)
        // Later shapes are drawn on top, so search back to front.
        return shapes.lastOrNull { SvgGeometry.pointInBoundary(point, it.boundary) }?.regionId
    }
}

object MapParser {

    /**
     * Builds the renderable map from the room artwork.
     *
     * Only elements that belong to a playable region in [definition] are kept:
     * auxiliary artwork and water surfaces are not interactive.
     */
    fun parse(svgText: String, definition: MapDefinition?): RenderableMap? {
        val document = runCatching { SvgSanitizer.parseSanitized(svgText) }.getOrNull() ?: return null
        val root = document.documentElement
        val viewBox = SvgSanitizer.parseViewBox(root)
        val playableIds = definition?.regionIds?.toSet()

        val shapes = root.selfAndDescendants()
            .filter { SvgGeometry.SURFACE_SHAPE_TAGS.contains(it.tag()) }
            .mapNotNull { element ->
                val regionId = element.attr("data-region-id") ?: element.attr("id") ?: return@mapNotNull null
                if (playableIds != null && !playableIds.contains(regionId)) return@mapNotNull null
                val matrix = SvgTransform.toRootMatrix(element)
                val local = SvgGeometry.localBoundary(element)
                if (local.isEmpty()) return@mapNotNull null
                val boundary = if (matrix.isIdentity) local else local.map { line -> line.map { matrix.apply(it) } }
                val bounds = Bounds.ofPoints(boundary.flatten())?.takeIf { it.valid } ?: return@mapNotNull null
                MapShape(
                    regionId = regionId,
                    path = boundary.toPath(),
                    boundary = boundary,
                    bounds = bounds,
                )
            }
            .toList()

        if (shapes.isEmpty()) return null
        return RenderableMap(viewBox, shapes)
    }

    private fun Boundary.toPath(): Path {
        val path = Path()
        for (line in this) {
            if (line.size < 2) continue
            path.moveTo(line.first().x.toFloat(), line.first().y.toFloat())
            for (index in 1 until line.size) {
                path.lineTo(line[index].x.toFloat(), line[index].y.toFloat())
            }
            path.close()
        }
        return path
    }
}
