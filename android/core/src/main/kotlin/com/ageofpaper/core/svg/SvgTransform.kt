package com.ageofpaper.core.svg

import com.ageofpaper.core.model.Matrix
import org.w3c.dom.Element
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.tan

/**
 * Replacement for `element.getScreenCTM()`.
 *
 * The browser reads the resolved transform chain from the layout engine; here
 * the same chain is composed by walking up to the root `svg` element and
 * multiplying every `transform` attribute (and `transform:` style declaration)
 * in document order. The result maps element local coordinates into root
 * viewBox user coordinates, which AGENTS.md defines as the only world space.
 */
object SvgTransform {

    private val FUNCTION = Regex("""([a-zA-Z]+)\s*\(([^)]*)\)""")
    private val NUMBERS = Regex("""[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?""")
    private val STYLE_TRANSFORM = Regex("""(?:^|;)\s*transform\s*:\s*([^;]+)""", RegexOption.IGNORE_CASE)

    fun parse(value: String?): Matrix {
        if (value.isNullOrBlank()) return Matrix.IDENTITY
        var matrix = Matrix.IDENTITY
        for (match in FUNCTION.findAll(value)) {
            val name = match.groupValues[1].lowercase()
            val args = NUMBERS.findAll(match.groupValues[2]).map { it.value.toDouble() }.toList()
            val next = when (name) {
                "matrix" -> if (args.size >= 6) {
                    Matrix(args[0], args[1], args[2], args[3], args[4], args[5])
                } else {
                    Matrix.IDENTITY
                }

                "translate" -> Matrix(e = args.getOrElse(0) { 0.0 }, f = args.getOrElse(1) { 0.0 })
                "scale" -> {
                    val sx = args.getOrElse(0) { 1.0 }
                    Matrix(a = sx, d = args.getOrElse(1) { sx })
                }

                "rotate" -> rotate(
                    args.getOrElse(0) { 0.0 },
                    args.getOrElse(1) { 0.0 },
                    args.getOrElse(2) { 0.0 },
                )

                "skewx" -> Matrix(c = tan(Math.toRadians(args.getOrElse(0) { 0.0 })))
                "skewy" -> Matrix(b = tan(Math.toRadians(args.getOrElse(0) { 0.0 })))
                else -> Matrix.IDENTITY
            }
            matrix = matrix.multiply(next)
        }
        return matrix
    }

    private fun rotate(degrees: Double, cx: Double, cy: Double): Matrix {
        val radians = Math.toRadians(degrees)
        val rotation = Matrix(a = cos(radians), b = sin(radians), c = -sin(radians), d = cos(radians))
        if (cx == 0.0 && cy == 0.0) return rotation
        return Matrix(e = cx, f = cy).multiply(rotation).multiply(Matrix(e = -cx, f = -cy))
    }

    fun elementTransform(element: Element): Matrix {
        val attribute = parse(element.attr("transform"))
        val styled = STYLE_TRANSFORM.find(element.attrOrEmpty("style"))?.groupValues?.get(1)
        return if (styled == null) attribute else attribute.multiply(parse(styled))
    }

    /** Composed element to root matrix, the analogue of the relative CTM. */
    fun toRootMatrix(element: Element): Matrix {
        val chain = mutableListOf<Element>()
        var current: Element? = element
        while (current != null && current.tag() != "svg") {
            chain.add(current)
            current = current.parentElement()
        }
        var matrix = Matrix.IDENTITY
        for (node in chain.asReversed()) {
            matrix = matrix.multiply(elementTransform(node))
        }
        return matrix
    }

    fun hasTransformContext(element: Element): Boolean {
        var current: Element? = element
        while (current != null && current.tag() != "svg") {
            if (current.attr("transform") != null ||
                STYLE_TRANSFORM.containsMatchIn(current.attrOrEmpty("style"))
            ) {
                return true
            }
            current = current.parentElement()
        }
        return false
    }
}
