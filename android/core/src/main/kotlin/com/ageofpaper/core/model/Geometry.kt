package com.ageofpaper.core.model

import kotlin.math.abs
import kotlin.math.hypot

data class Point(val x: Double, val y: Double)

/** A polyline set: each inner list is one continuous sampled line. */
typealias Boundary = List<List<Point>>

data class Bounds(val x: Double, val y: Double, val width: Double, val height: Double) {
    val valid: Boolean
        get() = x.isFinite() && y.isFinite() && width.isFinite() && height.isFinite() && width > 0 && height > 0

    val area: Double get() = if (valid) width * height else 0.0

    companion object {
        fun ofPoints(points: List<Point>): Bounds? {
            if (points.isEmpty()) return null
            val minX = points.minOf { it.x }
            val minY = points.minOf { it.y }
            val maxX = points.maxOf { it.x }
            val maxY = points.maxOf { it.y }
            return Bounds(minX, minY, maxX - minX, maxY - minY)
        }
    }
}

data class ViewBox(val x: Double, val y: Double, val width: Double, val height: Double) {
    val diagonal: Double get() = hypot(width, height)

    companion object {
        val DEFAULT = ViewBox(0.0, 0.0, 1000.0, 1000.0)
    }
}

data class Matrix(
    val a: Double = 1.0,
    val b: Double = 0.0,
    val c: Double = 0.0,
    val d: Double = 1.0,
    val e: Double = 0.0,
    val f: Double = 0.0,
) {
    fun multiply(other: Matrix): Matrix = Matrix(
        a = a * other.a + c * other.b,
        b = b * other.a + d * other.b,
        c = a * other.c + c * other.d,
        d = b * other.c + d * other.d,
        e = a * other.e + c * other.f + e,
        f = b * other.e + d * other.f + f,
    )

    fun apply(point: Point): Point = Point(
        x = a * point.x + c * point.y + e,
        y = b * point.x + d * point.y + f,
    )

    val isIdentity: Boolean
        get() = a == 1.0 && b == 0.0 && c == 0.0 && d == 1.0 && e == 0.0 && f == 0.0

    val isFinite: Boolean
        get() = a.isFinite() && b.isFinite() && c.isFinite() && d.isFinite() && e.isFinite() && f.isFinite()

    companion object {
        val IDENTITY = Matrix()
    }
}

fun Bounds.transformed(matrix: Matrix): Bounds? {
    if (!matrix.isFinite) return null
    val corners = listOf(
        Point(x, y),
        Point(x + width, y),
        Point(x + width, y + height),
        Point(x, y + height),
    ).map { matrix.apply(it) }
    if (corners.any { !it.x.isFinite() || !it.y.isFinite() }) return null
    return Bounds.ofPoints(corners)
}

fun boundsOverlap(a: Bounds?, b: Bounds?, tolerance: Double = 0.0): Boolean {
    if (a == null || b == null) return false
    return !(
        a.x + a.width + tolerance < b.x ||
            b.x + b.width + tolerance < a.x ||
            a.y + a.height + tolerance < b.y ||
            b.y + b.height + tolerance < a.y
        )
}

fun boundaryBounds(boundary: Boundary?): Bounds? {
    val points = boundary.orEmpty().flatten()
    return Bounds.ofPoints(points)
}

fun transformBoundary(boundary: Boundary?, matrix: Matrix): Boundary =
    boundary.orEmpty().map { line -> line.map { matrix.apply(it) } }

internal fun distance(a: Point, b: Point): Double = hypot(a.x - b.x, a.y - b.y)

internal fun approximately(a: Double, b: Double, epsilon: Double = 1e-9): Boolean = abs(a - b) <= epsilon
