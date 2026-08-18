package com.ageofpaper.core.svg

import com.ageofpaper.core.model.Boundary
import com.ageofpaper.core.model.Bounds
import com.ageofpaper.core.model.Point
import com.ageofpaper.core.model.ViewBox
import com.ageofpaper.core.model.boundaryBounds
import com.ageofpaper.core.model.boundsOverlap
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * Port of `src/game/svgAdjacency.js`.
 *
 * Two surfaces are neighbours when their boundaries run parallel and close for
 * a meaningful shared length. Thresholds scale with the root viewBox diagonal
 * so the result does not depend on CSS pixels or zoom.
 */
object SvgAdjacency {

    data class Thresholds(
        val tolerance: Double,
        val minimumSharedLength: Double,
        val minimumParallelCosine: Double = 0.82,
    )

    fun thresholds(viewBox: ViewBox?): Thresholds {
        val width = viewBox?.width?.takeIf { it.isFinite() && it != 0.0 } ?: 1.0
        val height = viewBox?.height?.takeIf { it.isFinite() && it != 0.0 } ?: 1.0
        val diagonal = hypot(width, height)
        val tolerance = max(diagonal * 0.00075, Double.MIN_VALUE)
        return Thresholds(
            tolerance = tolerance,
            minimumSharedLength = max(diagonal * 0.0015, tolerance * 4),
        )
    }

    private fun distance(a: Point, b: Point): Double = hypot(a.x - b.x, a.y - b.y)

    private fun segmentBounds(a: Point, b: Point): Bounds =
        Bounds(min(a.x, b.x), min(a.y, b.y), abs(a.x - b.x), abs(a.y - b.y))

    private fun pointToSegmentDistance(point: Point, start: Point, end: Point): Double {
        val dx = end.x - start.x
        val dy = end.y - start.y
        val lengthSquared = dx * dx + dy * dy
        if (lengthSquared == 0.0) return distance(point, start)
        val projection = (((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
            .coerceIn(0.0, 1.0)
        return distance(point, Point(start.x + projection * dx, start.y + projection * dy))
    }

    private fun orientation(a: Point, b: Point, c: Point): Double =
        (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

    private fun segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): Boolean {
        val epsilon = 1e-9
        val o1 = orientation(a1, a2, b1)
        val o2 = orientation(a1, a2, b2)
        val o3 = orientation(b1, b2, a1)
        val o4 = orientation(b1, b2, a2)
        return (o1 * o2 < -epsilon && o3 * o4 < -epsilon) ||
            (abs(o1) <= epsilon && pointToSegmentDistance(b1, a1, a2) <= epsilon) ||
            (abs(o2) <= epsilon && pointToSegmentDistance(b2, a1, a2) <= epsilon) ||
            (abs(o3) <= epsilon && pointToSegmentDistance(a1, b1, b2) <= epsilon) ||
            (abs(o4) <= epsilon && pointToSegmentDistance(a2, b1, b2) <= epsilon)
    }

    private fun segmentDistance(a1: Point, a2: Point, b1: Point, b2: Point): Double {
        if (segmentsIntersect(a1, a2, b1, b2)) return 0.0
        return minOf(
            pointToSegmentDistance(a1, b1, b2),
            pointToSegmentDistance(a2, b1, b2),
            pointToSegmentDistance(b1, a1, a2),
            pointToSegmentDistance(b2, a1, a2),
        )
    }

    private fun projectedOverlap(a1: Point, a2: Point, b1: Point, b2: Point): Double {
        val dx = a2.x - a1.x
        val dy = a2.y - a1.y
        val length = hypot(dx, dy)
        if (length == 0.0) return 0.0
        val ux = dx / length
        val uy = dy / length
        val bStart = (b1.x - a1.x) * ux + (b1.y - a1.y) * uy
        val bEnd = (b2.x - a1.x) * ux + (b2.y - a1.y) * uy
        return max(0.0, min(length, max(bStart, bEnd)) - max(0.0, min(bStart, bEnd)))
    }

    private fun sharedSegmentLength(
        a1: Point,
        a2: Point,
        b1: Point,
        b2: Point,
        thresholds: Thresholds,
    ): Double {
        val aLength = distance(a1, a2)
        val bLength = distance(b1, b2)
        if (aLength == 0.0 || bLength == 0.0) return 0.0
        if (!boundsOverlap(segmentBounds(a1, a2), segmentBounds(b1, b2), thresholds.tolerance)) return 0.0
        val dot = abs(
            ((a2.x - a1.x) * (b2.x - b1.x) + (a2.y - a1.y) * (b2.y - b1.y)) / (aLength * bLength),
        )
        if (dot < thresholds.minimumParallelCosine) return 0.0
        if (segmentDistance(a1, a2, b1, b2) > thresholds.tolerance) return 0.0
        return min(projectedOverlap(a1, a2, b1, b2), projectedOverlap(b1, b2, a1, a2))
    }

    fun areBoundariesAdjacent(first: Boundary?, second: Boundary?, thresholds: Thresholds): Boolean {
        if (!boundsOverlap(boundaryBounds(first), boundaryBounds(second), thresholds.tolerance)) return false

        var sharedLength = 0.0
        for (lineA in first.orEmpty()) {
            for (indexA in 1 until lineA.size) {
                var bestMatch = 0.0
                for (lineB in second.orEmpty()) {
                    for (indexB in 1 until lineB.size) {
                        bestMatch = max(
                            bestMatch,
                            sharedSegmentLength(
                                lineA[indexA - 1],
                                lineA[indexA],
                                lineB[indexB - 1],
                                lineB[indexB],
                                thresholds,
                            ),
                        )
                    }
                }
                sharedLength += bestMatch
                if (sharedLength >= thresholds.minimumSharedLength) return true
            }
        }
        return false
    }

    fun inferBoundaryAdjacency(
        regionIds: List<String>,
        boundariesById: Map<String, Boundary>,
        boundsById: Map<String, Bounds>,
        viewBox: ViewBox?,
    ): MutableMap<String, MutableSet<String>> {
        val graph = regionIds.associateWith { mutableSetOf<String>() }.toMutableMap()
        val thresholds = thresholds(viewBox)
        for (first in regionIds.indices) {
            val firstId = regionIds[first]
            for (second in first + 1 until regionIds.size) {
                val secondId = regionIds[second]
                if (!boundsOverlap(boundsById[firstId], boundsById[secondId], thresholds.tolerance)) continue
                if (!areBoundariesAdjacent(boundariesById[firstId], boundariesById[secondId], thresholds)) continue
                graph.getValue(firstId).add(secondId)
                graph.getValue(secondId).add(firstId)
            }
        }
        return graph
    }
}
