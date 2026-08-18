package com.ageofpaper.core.svg

import com.ageofpaper.core.model.ViewBox
import org.w3c.dom.Document
import org.w3c.dom.Element

/** Port of the sanitiser in `src/game/mapImporter.js`. */
object SvgSanitizer {

    val DANGEROUS_ELEMENTS = setOf(
        "script",
        "foreignobject",
        "iframe",
        "object",
        "embed",
        "animate",
        "animatemotion",
        "animatetransform",
        "set",
    )

    val EXCLUDED_ANCESTORS = setOf("defs", "clippath", "mask", "pattern", "marker", "symbol")

    private val REMOTE_URL = Regex("""url\(\s*['"]?(?:https?:|//|data:)""", RegexOption.IGNORE_CASE)
    private val SCRIPT_URL = Regex("""javascript:|data:text/html""", RegexOption.IGNORE_CASE)
    private val STYLE_IMPORT = Regex("""@import|url\(\s*['"]?(?:https?:|//|data:)""", RegexOption.IGNORE_CASE)

    fun sanitizeDocument(document: Document) {
        val root = document.documentElement
        root.selfAndDescendants()
            .filter { DANGEROUS_ELEMENTS.contains(it.tag()) }
            .toList()
            .forEach { it.remove() }

        root.selfAndDescendants().toList().forEach { element ->
            val attributes = element.attributes
            val doomed = mutableListOf<String>()
            for (index in 0 until attributes.length) {
                val attribute = attributes.item(index)
                val name = attribute.nodeName.lowercase()
                val value = attribute.nodeValue.orEmpty().trim()
                val remove = when {
                    name.startsWith("on") -> true
                    name == "href" || name == "xlink:href" -> !value.startsWith("#")
                    name == "src" || SCRIPT_URL.containsMatchIn(value) -> true
                    REMOTE_URL.containsMatchIn(value) -> true
                    else -> false
                }
                if (remove) doomed.add(attribute.nodeName)
            }
            doomed.forEach { element.removeAttribute(it) }
        }

        root.selfAndDescendants()
            .filter { it.tag() == "style" && STYLE_IMPORT.containsMatchIn(it.textContentOrEmpty()) }
            .toList()
            .forEach { it.remove() }
    }

    fun parseSanitized(svgText: String?): Document {
        val document = SvgDom.parse(svgText)
        sanitizeDocument(document)
        document.documentElement.setAttribute("xmlns", SvgDom.SVG_NS)
        return document
    }

    fun sanitizeMarkup(svgText: String?): String = SvgDom.serialize(parseSanitized(svgText).documentElement)

    private val NUMBER_SEPARATOR = Regex("""[\s,]+""")

    fun parseNumber(value: String?): Double? {
        if (value.isNullOrBlank()) return null
        val number = value.trim().toDoubleOrNull()
        return if (number != null && number.isFinite()) number else null
    }

    /**
     * Reads the root `viewBox`, falling back to `width`/`height` and writing the
     * derived box back so every later measurement shares one coordinate system.
     */
    fun parseViewBox(svg: Element, writeBack: Boolean = false): ViewBox {
        val parts = svg.attrOrEmpty("viewBox").trim()
            .split(NUMBER_SEPARATOR)
            .filter { it.isNotEmpty() }
            .map { it.toDoubleOrNull() }
        if (parts.size == 4 && parts.all { it != null && it.isFinite() } && parts[2]!! > 0 && parts[3]!! > 0) {
            return ViewBox(parts[0]!!, parts[1]!!, parts[2]!!, parts[3]!!)
        }
        val width = parseNumber(svg.attr("width")) ?: 1000.0
        val height = parseNumber(svg.attr("height")) ?: 1000.0
        val safeWidth = if (width > 0) width else 1000.0
        val safeHeight = if (height > 0) height else 1000.0
        if (writeBack) {
            svg.setAttribute("viewBox", "0 0 ${trim(safeWidth)} ${trim(safeHeight)}")
        }
        return ViewBox(0.0, 0.0, safeWidth, safeHeight)
    }

    private fun trim(value: Double): String =
        if (value == value.toLong().toDouble()) value.toLong().toString() else value.toString()

    fun booleanAttribute(value: String?): Boolean? = when {
        value == null -> null
        Regex("^(true|1|yes)$", RegexOption.IGNORE_CASE).matches(value) -> true
        Regex("^(false|0|no)$", RegexOption.IGNORE_CASE).matches(value) -> false
        else -> null
    }

    private val ID_SEPARATOR = Regex("""[\s,;]+""")

    fun splitIds(value: String?): List<String>? =
        value?.split(ID_SEPARATOR)?.map { it.trim() }?.filter { it.isNotEmpty() }
}
