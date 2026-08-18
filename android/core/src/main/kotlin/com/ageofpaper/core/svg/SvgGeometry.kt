package com.ageofpaper.core.svg

import com.ageofpaper.core.model.Boundary
import com.ageofpaper.core.model.Bounds
import com.ageofpaper.core.model.Matrix
import com.ageofpaper.core.model.Point
import com.ageofpaper.core.model.ViewBox
import com.ageofpaper.core.model.transformed
import org.w3c.dom.Element
import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * Port of `src/game/svgGeometry.js`.
 *
 * The browser measures a region with `getBBox()` plus a `getPointAtLength()`
 * walk and converts the result into root viewBox coordinates. Here the geometry
 * is flattened locally by [SvgPath], resampled with the same arc length step,
 * and mapped through the composed element to root matrix from [SvgTransform].
 */
object SvgGeometry {

    private const val CIRCLE_STEPS = 96
    private const val MAX_SAMPLES = 4096
    private const val MIN_SAMPLES = 24

    val SURFACE_SHAPE_TAGS = setOf("path", "polygon", "rect", "circle", "ellipse", "polyline")

    private val NUMBERS = Regex("""-?\d*\.?\d+(?:e[-+]?\d+)?""", RegexOption.IGNORE_CASE)

    fun parsedPoints(points: String?): List<Point> {
        val numbers = NUMBERS.findAll(points.orEmpty()).map { it.value.toDouble() }.toList()
        if (numbers.size < 4 || numbers.size % 2 != 0) return emptyList()
        return (numbers.indices step 2).map { Point(numbers[it], numbers[it + 1]) }
    }

    /** Untransformed local geometry of a shape element. */
    fun localBoundary(element: Element): Boundary {
        return when (element.tag()) {
            "path" -> SvgPath.boundaryOf(element.attr("d"))
            "polygon", "polyline" -> {
                val points = parsedPoints(element.attr("points")).toMutableList()
                if (points.size < 2) {
                    emptyList()
                } else {
                    if (element.tag() == "polygon" && points.first() != points.last()) {
                        points.add(points.first())
                    }
                    listOf(points)
                }
            }

            "rect" -> {
                val x = number(element, "x")
                val y = number(element, "y")
                val width = number(element, "width")
                val height = number(element, "height")
                if (width <= 0 || height <= 0) {
                    emptyList()
                } else {
                    listOf(
                        listOf(
                            Point(x, y),
                            Point(x + width, y),
                            Point(x + width, y + height),
                            Point(x, y + height),
                            Point(x, y),
                        ),
                    )
                }
            }

            "circle", "ellipse" -> {
                val cx = number(element, "cx")
                val cy = number(element, "cy")
                val rx = if (element.tag() == "circle") number(element, "r") else number(element, "rx")
                val ry = if (element.tag() == "circle") rx else number(element, "ry")
                if (rx <= 0 || ry <= 0) {
                    emptyList()
                } else {
                    listOf(
                        (0..CIRCLE_STEPS).map { step ->
                            val angle = PI * 2 * step / CIRCLE_STEPS
                            Point(cx + cos(angle) * rx, cy + sin(angle) * ry)
                        },
                    )
                }
            }

            else -> emptyList()
        }
    }

    private fun number(element: Element, name: String): Double =
        SvgSanitizer.parseNumber(element.attr(name)) ?: 0.0

    fun localBounds(element: Element): Bounds? = Bounds.ofPoints(localBoundary(element).flatten())

    /** Bounds for shapes that carry no transform context, used as a fallback. */
    fun basicShapeBounds(element: Element): Bounds? {
        if (SvgTransform.hasTransformContext(element)) return null
        val bounds = when (element.tag()) {
            "rect" -> Bounds(
                number(element, "x"),
                number(element, "y"),
                number(element, "width"),
                number(element, "height"),
            )

            "circle", "ellipse" -> {
                val cx = number(element, "cx")
                val cy = number(element, "cy")
                val rx = if (element.tag() == "circle") number(element, "r") else number(element, "rx")
                val ry = if (element.tag() == "circle") rx else number(element, "ry")
                Bounds(cx - rx, cy - ry, rx * 2, ry * 2)
            }

            "polygon", "polyline" -> Bounds.ofPoints(parsedPoints(element.attr("points")))
            else -> null
        }
        return bounds?.takeIf { it.valid }
    }

    fun applyMatrixToBounds(bounds: Bounds?, matrix: Matrix): Bounds? = bounds?.transformed(matrix)

    data class MeasuredGeometry(
        val boundsById: Map<String, Bounds>,
        val boundariesById: Map<String, Boundary>,
        val unmeasuredIds: List<String>,
        val unmeasuredBoundaryIds: List<String>,
    )

    fun targetStep(viewBox: ViewBox): Double = maxOf(hypot(viewBox.width, viewBox.height) * 0.00125, 0.05)

    /**
     * Resamples a flattened boundary at a constant arc length step and splits a
     * line whenever the walk jumps more than eight steps, which is how the
     * browser walk separates disjoint subpaths.
     */
    fun resample(boundary: Boundary, step: Double): Boundary {
        val flat = boundary.filter { it.size > 1 }
        if (flat.isEmpty() || step <= 0) return emptyList()

        val segments = mutableListOf<Pair<Point, Point>>()
        for (line in flat) {
            for (index in 1 until line.size) segments.add(line[index - 1] to line[index])
        }
        val lengths = segments.map { hypot(it.second.x - it.first.x, it.second.y - it.first.y) }
        val total = lengths.sum()
        if (total <= 0) return emptyList()

        val samples = ceil(total / step).toInt().coerceIn(MIN_SAMPLES, MAX_SAMPLES)
        val lines = mutableListOf(mutableListOf<Point>())
        var segmentIndex = 0
        var consumed = 0.0

        for (index in 0..samples) {
            val distance = total * index / samples
            while (segmentIndex < segments.size - 1 && consumed + lengths[segmentIndex] < distance) {
                consumed += lengths[segmentIndex]
                segmentIndex++
            }
            val segment = segments[segmentIndex]
            val segmentLength = lengths[segmentIndex]
            val ratio = if (segmentLength > 0) ((distance - consumed) / segmentLength).coerceIn(0.0, 1.0) else 0.0
            val point = Point(
                segment.first.x + (segment.second.x - segment.first.x) * ratio,
                segment.first.y + (segment.second.y - segment.first.y) * ratio,
            )
            val current = lines.last()
            val previous = current.lastOrNull()
            if (previous != null && hypot(point.x - previous.x, point.y - previous.y) > step * 8) {
                lines.add(mutableListOf())
            }
            lines.last().add(point)
        }
        return lines.filter { it.size > 1 }
    }

    /**
     * Measures every record in root viewBox coordinates. Records are identified
     * by the `data-region-id` attribute the caller has already assigned.
     */
    fun measureRegionGeometry(
        records: List<Pair<String, Element>>,
        viewBox: ViewBox,
    ): MeasuredGeometry {
        val boundsById = mutableMapOf<String, Bounds>()
        val boundariesById = mutableMapOf<String, Boundary>()
        val unmeasuredIds = mutableListOf<String>()
        val unmeasuredBoundaryIds = mutableListOf<String>()
        val step = targetStep(viewBox)

        for ((id, element) in records) {
            val matrix = SvgTransform.toRootMatrix(element)
            val local = localBoundary(element)
            val transformed = if (matrix.isIdentity) local else local.map { line -> line.map { matrix.apply(it) } }
            val bounds = Bounds.ofPoints(transformed.flatten())?.takeIf { it.valid }
                ?: basicShapeBounds(element)?.let { if (matrix.isIdentity) it else it.transformed(matrix) }

            if (bounds != null && bounds.valid) boundsById[id] = bounds else unmeasuredIds.add(id)

            val boundary = resample(transformed, step)
            if (boundary.isNotEmpty()) boundariesById[id] = boundary else unmeasuredBoundaryIds.add(id)
        }

        return MeasuredGeometry(boundsById, boundariesById, unmeasuredIds, unmeasuredBoundaryIds)
    }

    fun boundsArea(bounds: Bounds?): Double? =
        if (bounds != null && bounds.valid) bounds.width * bounds.height else null

    /** Ray casting fill test used by the terrain grid. */
    fun pointInLine(point: Point, line: List<Point>): Boolean {
        var inside = false
        var second = line.size - 1
        for (first in line.indices) {
            val a = line[first]
            val b = line[second]
            val crosses = (a.y > point.y) != (b.y > point.y) &&
                point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y).takeIf { it != 0.0 } ?: Double.MIN_VALUE) + a.x
            if (crosses) inside = !inside
            second = first
        }
        return inside
    }

    fun pointInBoundary(point: Point, boundary: Boundary?): Boolean {
        var inside = false
        for (line in boundary.orEmpty()) {
            if (line.size > 2 && pointInLine(point, line)) inside = !inside
        }
        return inside
    }
}
