package com.ageofpaper.core.svg

import com.ageofpaper.core.model.Point
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sign
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Flattens SVG path data into polylines.
 *
 * This replaces `getTotalLength()` / `getPointAtLength()`. Curves are
 * subdivided finely enough that the resulting polyline is what later stages
 * (bounds, adjacency, point-in-fill) measure, so the sampling density is the
 * only place where geometry precision is decided.
 */
object SvgPath {

    private const val CURVE_SEGMENTS = 48

    private val COMMAND = Regex("""[MmZzLlHhVvCcSsQqTtAa]""")
    private val NUMBER = Regex("""[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?""")

    /** One subpath: the sampled points and whether the path closed it. */
    data class SubPath(val points: List<Point>, val closed: Boolean)

    fun parse(data: String?): List<SubPath> {
        if (data.isNullOrBlank()) return emptyList()
        val tokens = tokenize(data)
        if (tokens.isEmpty()) return emptyList()

        val subPaths = mutableListOf<SubPath>()
        var current = mutableListOf<Point>()
        var closed = false
        var cursor = Point(0.0, 0.0)
        var start = Point(0.0, 0.0)
        var lastControl: Point? = null
        var lastCommand = ' '

        fun flush() {
            if (current.size > 1) subPaths.add(SubPath(current.toList(), closed))
            current = mutableListOf()
            closed = false
        }

        var index = 0
        while (index < tokens.size) {
            val token = tokens[index]
            val command = (token as? Token.Command)?.value ?: lastCommand
            if (token is Token.Command) index++
            if (command == ' ') break
            val relative = command.isLowerCase()
            val type = command.uppercaseChar()

            fun number(): Double {
                val next = tokens.getOrNull(index)
                index++
                return (next as? Token.Number)?.value ?: 0.0
            }

            when (type) {
                'M' -> {
                    val x = number()
                    val y = number()
                    val point = if (relative) Point(cursor.x + x, cursor.y + y) else Point(x, y)
                    flush()
                    cursor = point
                    start = point
                    current.add(point)
                    lastControl = null
                    // Implicit line-to commands follow a move-to.
                    lastCommand = if (relative) 'l' else 'L'
                }

                'L' -> {
                    val x = number()
                    val y = number()
                    cursor = if (relative) Point(cursor.x + x, cursor.y + y) else Point(x, y)
                    current.add(cursor)
                    lastControl = null
                    lastCommand = command
                }

                'H' -> {
                    val x = number()
                    cursor = if (relative) Point(cursor.x + x, cursor.y) else Point(x, cursor.y)
                    current.add(cursor)
                    lastControl = null
                    lastCommand = command
                }

                'V' -> {
                    val y = number()
                    cursor = if (relative) Point(cursor.x, cursor.y + y) else Point(cursor.x, y)
                    current.add(cursor)
                    lastControl = null
                    lastCommand = command
                }

                'C', 'S' -> {
                    val control1 = if (type == 'C') {
                        val cx = number()
                        val cy = number()
                        if (relative) Point(cursor.x + cx, cursor.y + cy) else Point(cx, cy)
                    } else {
                        reflect(cursor, lastControl)
                    }
                    val c2x = number()
                    val c2y = number()
                    val control2 = if (relative) Point(cursor.x + c2x, cursor.y + c2y) else Point(c2x, c2y)
                    val ex = number()
                    val ey = number()
                    val end = if (relative) Point(cursor.x + ex, cursor.y + ey) else Point(ex, ey)
                    appendCubic(current, cursor, control1, control2, end)
                    cursor = end
                    lastControl = control2
                    lastCommand = command
                }

                'Q', 'T' -> {
                    val control = if (type == 'Q') {
                        val cx = number()
                        val cy = number()
                        if (relative) Point(cursor.x + cx, cursor.y + cy) else Point(cx, cy)
                    } else {
                        reflect(cursor, lastControl)
                    }
                    val ex = number()
                    val ey = number()
                    val end = if (relative) Point(cursor.x + ex, cursor.y + ey) else Point(ex, ey)
                    appendQuadratic(current, cursor, control, end)
                    cursor = end
                    lastControl = control
                    lastCommand = command
                }

                'A' -> {
                    val rx = number()
                    val ry = number()
                    val rotation = number()
                    val largeArc = number() != 0.0
                    val sweep = number() != 0.0
                    val ex = number()
                    val ey = number()
                    val end = if (relative) Point(cursor.x + ex, cursor.y + ey) else Point(ex, ey)
                    appendArc(current, cursor, rx, ry, rotation, largeArc, sweep, end)
                    cursor = end
                    lastControl = null
                    lastCommand = command
                }

                'Z' -> {
                    if (current.isNotEmpty()) {
                        current.add(start)
                        closed = true
                    }
                    flush()
                    cursor = start
                    current.add(start)
                    lastControl = null
                    lastCommand = command
                }

                else -> index++
            }
        }
        flush()
        return subPaths.filter { it.points.size > 1 }
    }

    fun boundaryOf(data: String?): List<List<Point>> = parse(data).map { it.points }

    private sealed interface Token {
        data class Command(val value: Char) : Token
        data class Number(val value: Double) : Token
    }

    private fun tokenize(data: String): List<Token> {
        val tokens = mutableListOf<Token>()
        var index = 0
        while (index < data.length) {
            val char = data[index]
            when {
                char.isWhitespace() || char == ',' -> index++
                COMMAND.matches(char.toString()) -> {
                    tokens.add(Token.Command(char))
                    index++
                }

                else -> {
                    val match = NUMBER.find(data, index)
                    if (match == null || match.range.first != index) {
                        index++
                    } else {
                        tokens.add(Token.Number(match.value.toDouble()))
                        index = match.range.last + 1
                    }
                }
            }
        }
        return tokens
    }

    private fun reflect(cursor: Point, control: Point?): Point =
        if (control == null) cursor else Point(2 * cursor.x - control.x, 2 * cursor.y - control.y)

    private fun appendCubic(out: MutableList<Point>, from: Point, c1: Point, c2: Point, to: Point) {
        val steps = curveSteps(from, to, c1, c2)
        for (step in 1..steps) {
            val t = step.toDouble() / steps
            val inverse = 1 - t
            val x = inverse * inverse * inverse * from.x +
                3 * inverse * inverse * t * c1.x +
                3 * inverse * t * t * c2.x +
                t * t * t * to.x
            val y = inverse * inverse * inverse * from.y +
                3 * inverse * inverse * t * c1.y +
                3 * inverse * t * t * c2.y +
                t * t * t * to.y
            out.add(Point(x, y))
        }
    }

    private fun appendQuadratic(out: MutableList<Point>, from: Point, control: Point, to: Point) {
        val steps = curveSteps(from, to, control, control)
        for (step in 1..steps) {
            val t = step.toDouble() / steps
            val inverse = 1 - t
            val x = inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x
            val y = inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y
            out.add(Point(x, y))
        }
    }

    private fun curveSteps(from: Point, to: Point, c1: Point, c2: Point): Int {
        val rough = hypot(c1.x - from.x, c1.y - from.y) +
            hypot(c2.x - c1.x, c2.y - c1.y) +
            hypot(to.x - c2.x, to.y - c2.y)
        val direct = hypot(to.x - from.x, to.y - from.y)
        val estimate = (rough + direct) / 2
        if (!estimate.isFinite() || estimate <= 0) return 2
        return ceil(estimate / 2).toInt().coerceIn(4, CURVE_SEGMENTS)
    }

    /** Endpoint parameterisation from the SVG implementation notes (F.6.5). */
    private fun appendArc(
        out: MutableList<Point>,
        from: Point,
        radiusX: Double,
        radiusY: Double,
        rotationDegrees: Double,
        largeArc: Boolean,
        sweep: Boolean,
        to: Point,
    ) {
        var rx = abs(radiusX)
        var ry = abs(radiusY)
        if (rx == 0.0 || ry == 0.0 || (from.x == to.x && from.y == to.y)) {
            out.add(to)
            return
        }
        val phi = Math.toRadians(rotationDegrees % 360.0)
        val cosPhi = cos(phi)
        val sinPhi = sin(phi)
        val dx = (from.x - to.x) / 2
        val dy = (from.y - to.y) / 2
        val x1 = cosPhi * dx + sinPhi * dy
        val y1 = -sinPhi * dx + cosPhi * dy

        val lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
        if (lambda > 1) {
            val scale = sqrt(lambda)
            rx *= scale
            ry *= scale
        }

        val numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
        val denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1
        val factor = if (denominator == 0.0) 0.0 else sqrt(maxOf(0.0, numerator / denominator))
        val sign = if (largeArc == sweep) -1.0 else 1.0
        val cx1 = sign * factor * (rx * y1 / ry)
        val cy1 = sign * factor * (-ry * x1 / rx)

        val cx = cosPhi * cx1 - sinPhi * cy1 + (from.x + to.x) / 2
        val cy = sinPhi * cx1 + cosPhi * cy1 + (from.y + to.y) / 2

        val startAngle = angle(1.0, 0.0, (x1 - cx1) / rx, (y1 - cy1) / ry)
        var sweepAngle = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
        if (!sweep && sweepAngle > 0) sweepAngle -= 2 * PI
        if (sweep && sweepAngle < 0) sweepAngle += 2 * PI

        val steps = ceil(abs(sweepAngle) / (PI / 18)).toInt().coerceIn(4, CURVE_SEGMENTS)
        for (step in 1..steps) {
            val theta = startAngle + sweepAngle * step / steps
            val x = cosPhi * rx * cos(theta) - sinPhi * ry * sin(theta) + cx
            val y = sinPhi * rx * cos(theta) + cosPhi * ry * sin(theta) + cy
            out.add(Point(x, y))
        }
    }

    private fun angle(ux: Double, uy: Double, vx: Double, vy: Double): Double {
        val dot = ux * vx + uy * vy
        val lengths = hypot(ux, uy) * hypot(vx, vy)
        if (lengths == 0.0) return 0.0
        val cosine = (dot / lengths).coerceIn(-1.0, 1.0)
        val value = acos(cosine)
        val orientation = ux * vy - uy * vx
        return if (orientation < 0) -value else value * sign(1.0)
    }
}
